import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy } from './canonicalProxies';
import { writeArchive } from './archiveUtil';

/*
Hardhat task: zarp:audit-admins
Purpose: Audit DEFAULT_ADMIN_ROLE holders across multiple networks.

Checks per network:
 - Resolve proxy (deployment record if present else canonical registry)
 - Ensure proxy has code
 - Read DEFAULT_ADMIN_ROLE and evaluate hasRole for:
    • expected admin from deployment record (if present)
    • deployer from deployment record (helpful to confirm renounce)
    • any addresses supplied via flags

Defaults:
  --nets sepolia,polygonAmoy,baseSepolia,gnosisChiado
Flags:
  --nets <csv>                Comma-separated network names
  --addresses <csv>           DEPRECATED: comma-separated addresses to check
  --json                      Emit JSON (default if pretty not set)
  --pretty                    Pretty print table
  --archive                   Persist JSON under deployments/records/<network>/

Positional args:
  [address ...]               One or more addresses to check (passed positionally, e.g. 0xAAA... 0xBBB...)
*/

const MIN_DEFAULT_NETS = ['sepolia', 'polygonAmoy', 'baseSepolia', 'gnosisChiado'];

task('zarp:audit-admins', 'Audit DEFAULT_ADMIN_ROLE across networks')
  .addOptionalParam('nets', 'Comma separated network names to audit')
  .addOptionalParam('addresses', 'DEPRECATED: comma-separated addresses to inspect (use repeated --address)')
  .addOptionalVariadicPositionalParam('address', 'One or more addresses to inspect (positional, e.g. 0xAAA... 0xBBB...)')
  .addFlag('json', 'Emit JSON only')
  .addFlag('pretty', 'Pretty-print table output')
  .addFlag('archive', 'Persist snapshot JSON under deployments/records/<network>/')
  .setAction(async (args, hre) => {
    const { nets, addresses, address, json, pretty, archive } = args as any;
    const targets: string[] = [];
    if (address) {
      const list = Array.isArray(address) ? address : [address];
      for (const a of list) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Invalid --address value: ${a}`);
        if (!targets.some(t => t.toLowerCase() === a.toLowerCase())) targets.push(a);
      }
    }
    if (addresses) {
      if (!json) console.warn('Warning: --addresses is deprecated; use repeated --address flags');
      for (const a of String(addresses)
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Invalid address in deprecated list: ${a}`);
        if (!targets.some(t => t.toLowerCase() === a.toLowerCase())) targets.push(a);
      }
    }

    const targetNets = (nets ? String(nets).split(',') : MIN_DEFAULT_NETS).map((n: string) => n.trim()).filter(Boolean);

    // Minimal ABI for AccessControl
    const abi = [
      'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
      'function hasRole(bytes32 role, address account) view returns (bool)',
    ];

    const results: any[] = [];

    for (const netName of targetNets) {
      const netCfg: any = (hre.config.networks as any)[netName];
      if (!netCfg) {
        results.push({ network: netName, error: 'No network config' });
        continue;
      }
      const url: string | undefined = netCfg.url;
      if (!url) {
        results.push({ network: netName, error: 'No RPC url' });
        continue;
      }
      try {
        const provider = new (hre.ethers as any).JsonRpcProvider(url);
        const net = await provider.getNetwork();
        const chainId = Number(net.chainId);
        const expected = expectedCanonicalProxy(chainId);

        // Load deployment record if present
        const recordPath = path.join(process.cwd(), 'deployments', `${netName}.zarp.json`);
        let record: any = null;
        if (fs.existsSync(recordPath)) {
          try {
            record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
          } catch {}
        }
        const recordProxy: string | undefined = record?.proxy;
        const recordAdmin: string | undefined = record?.granted?.admin;
        const recordDeployer: string | undefined = record?.deployer;
        const proxy = recordProxy || expected;

        if (!proxy) {
          results.push({ network: netName, chainId, error: 'No proxy resolved (no record and no registry mapping)' });
          continue;
        }
        if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) {
          results.push({ network: netName, chainId, proxy, error: 'Invalid proxy address format' });
          continue;
        }

        const code = await provider.getCode(proxy);
        const hasCode = !!code && code !== '0x';
        if (!hasCode) {
          results.push({ network: netName, chainId, proxy, error: 'No code at proxy' });
          continue;
        }

        const contract = new (hre.ethers as any).Contract(proxy, abi, provider);
        const ADMIN = await contract.DEFAULT_ADMIN_ROLE();

        const checks: Array<{ address: string; hasAdmin: boolean }> = [];
        const addCheck = async (addr?: string | null) => {
          if (!addr) return;
          if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
          if (checks.some(c => c.address.toLowerCase() === addr.toLowerCase())) return;
          const hasAdmin = await contract.hasRole(ADMIN, addr);
          checks.push({ address: addr, hasAdmin });
        };

        // Prioritize record admin, deployer, and user targets
        await addCheck(recordAdmin);
        await addCheck(recordDeployer);
        for (const t of targets) await addCheck(t);

        const entry: any = {
          network: netName,
          chainId,
          proxy,
          recordProxy: recordProxy || null,
          recordMatchesExpected: recordProxy && expected ? recordProxy.toLowerCase() === expected.toLowerCase() : null,
          expectedCanonical: expected || null,
          hasCode,
          adminRole: ADMIN,
          recordAdmin: recordAdmin || null,
          recordDeployer: recordDeployer || null,
          checks,
          renouncedFlag: typeof record?.renounced === 'boolean' ? record.renounced : null,
        };

        // Heuristic warnings
        const warnings: string[] = [];
        const recAdminCheck = checks.find(c => c.address && recordAdmin && c.address.toLowerCase() === recordAdmin.toLowerCase());
        if (recordAdmin && recAdminCheck && recAdminCheck.hasAdmin === false) {
          warnings.push(`Record admin ${recordAdmin} does NOT hold DEFAULT_ADMIN_ROLE`);
        }
        const depCheck = checks.find(c => c.address && recordDeployer && c.address.toLowerCase() === recordDeployer.toLowerCase());
        if (record?.renounced === true && depCheck && depCheck.hasAdmin === true) {
          warnings.push(`Deployer ${recordDeployer} still holds DEFAULT_ADMIN_ROLE despite renounced=true`);
        }
        if (recordProxy && expected && recordProxy.toLowerCase() !== expected.toLowerCase()) {
          warnings.push(`Deployment record proxy ${recordProxy} != expected canonical ${expected}`);
        }
        if (warnings.length) entry.warnings = warnings;

        results.push(entry);

        if (archive) {
          try {
            writeArchive(netName, 'admin-audit', entry);
          } catch {}
        }
      } catch (e: any) {
        results.push({ network: netName, error: e?.message || String(e) });
      }
    }

    if (json || !pretty) {
      console.log(JSON.stringify(results));
      return;
    }

    // Pretty print summary
    const header = ['Network', 'ChainId', 'Proxy', 'RecordAdmin', 'Deployer', 'RecordAdminHas?', 'DeployerHas?'];
    console.log(header.join('  '));
    for (const r of results) {
      if (r.error) {
        console.log(`${String(r.network).padEnd(12)}  ${(r.chainId || '').toString().padEnd(6)}  ERR: ${r.error}`);
        continue;
      }
      const recAdmin = r.recordAdmin || '';
      const dep = r.recordDeployer || '';
      const recAdminHas = (r.checks || []).find((c: any) => recAdmin && c.address.toLowerCase() === recAdmin.toLowerCase());
      const depHas = (r.checks || []).find((c: any) => dep && c.address.toLowerCase() === dep.toLowerCase());
      console.log(
        [
          String(r.network).padEnd(12),
          String(r.chainId).padEnd(6),
          String(r.proxy),
          recAdmin,
          dep,
          recAdminHas ? String(recAdminHas.hasAdmin).padEnd(5) : ''.padEnd(5),
          depHas ? String(depHas.hasAdmin).padEnd(5) : ''.padEnd(5),
        ].join('  '),
      );
      if (Array.isArray(r.warnings)) {
        for (const w of r.warnings) console.log(`  WARNING: ${w}`);
      }
    }
  });
