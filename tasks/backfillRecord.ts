import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy } from './canonicalProxies';
import { writeArchive } from './archiveUtil';

/*
Task: zarp:backfill-record
Derives and writes deployments/<network>.zarp.json for an already-deployed canonical proxy when the
original deploy:roles record was not captured.

Behavior:
- Resolves canonical proxy address via registry (chainId -> canonical) unless --proxy override provided.
- Reads current implementation via ERC1967.
- Optionally infers deployer from first tx creating the proxy if RPC supports trace/debug and --infer-deployer flag is used (otherwise require --deployer address).
- Stores minimal JSON schema matching deploy:roles output (network, proxy, implementation, deployer, timestamp, granted, renounced:false).
- Refuses to overwrite existing record unless --overwrite.
- Safety: If on a known network and code at canonical absent -> abort.
- Safety: If proxy override given but differs from canonical on a known production network (mainnet, polygon, base, sepolia, gnosis) -> require --allow-noncanonical.
- Archives snapshot if --archive flag specified.

Usage examples:
  yarn hardhat zarp:backfill-record --network sepolia --deployer 0xfA4EB9AA068B3b64348f42b142E270f28E2f86EB --all-roles 0xfA4EB9AA068B3b64348f42b142E270f28E2f86EB
  yarn hardhat zarp:backfill-record --network polygon --deployer 0xAdmin --roles-json roles.json
  yarn hardhat zarp:backfill-record --network sepolia --proxy 0xProxy --deployer 0xAdmin --overwrite
*/

task('zarp:backfill-record', 'Backfill deployments/<network>.zarp.json from on-chain canonical proxy')
  .addOptionalParam('proxy', 'Explicit proxy address override (default: registry canonical)')
  .addOptionalParam('deployer', 'Deployer address (required unless --infer-deployer)')
  .addOptionalParam('rolesJson', 'Path to JSON file mapping role keys to addresses (admin,minter,verifier,burner,pauser,upgrader)')
  .addOptionalParam('allRoles', 'Single address to assign to all role keys if rolesJson not provided')
  .addFlag('inferDeployer', 'Attempt to infer deployer (NOT IMPLEMENTED YET)')
  .addFlag('overwrite', 'Allow overwriting existing deployments/<network>.zarp.json')
  .addFlag('allowNoncanonical', 'Allow writing record for non-canonical proxy override')
  .addFlag('archive', 'Archive backfill result under deployments/records/<network>/')
  .addFlag('json', 'Emit JSON only')
  .setAction(async (args, hre) => {
    const { proxy: proxyOverride, deployer, rolesJson, allRoles, inferDeployer, overwrite, allowNoncanonical, archive, json } = args;
    if (inferDeployer) {
      throw new Error('--infer-deployer not implemented yet; please supply --deployer');
    }
    const { network, ethers } = hre;
    // Resolve chainId robustly
    let chainId = network.config.chainId as number | undefined;
    if (!chainId) {
      try {
        chainId = Number((await ethers.provider.getNetwork()).chainId.toString());
      } catch {}
    }
    if (chainId === undefined) throw new Error('Unable to resolve chainId');

    const canonical = expectedCanonicalProxy(chainId);
    let proxy = proxyOverride || canonical;
    if (!proxy) throw new Error('No canonical proxy known for this chain; supply --proxy');
    if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) throw new Error(`Invalid proxy address: ${proxy}`);

    const knownProd = new Set([1, 137, 8453, 42161, 11155111]); // include sepolia chainId
    if (proxyOverride && canonical && proxy.toLowerCase() !== canonical.toLowerCase() && knownProd.has(chainId) && !allowNoncanonical) {
      throw new Error(`Proxy override ${proxy} != canonical ${canonical} for chainId ${chainId}; pass --allow-noncanonical to force.`);
    }

    const code = await ethers.provider.getCode(proxy);
    if (!code || code === '0x') throw new Error(`No contract code at ${proxy} (chainId ${chainId}); cannot backfill.`);

    if (!deployer || !/^0x[0-9a-fA-F]{40}$/.test(deployer)) {
      throw new Error('Must supply valid --deployer (0x address)');
    }

    // Roles resolution
    let granted: Record<string, string | undefined> = {
      admin: undefined,
      minter: undefined,
      verifier: undefined,
      burner: undefined,
      pauser: undefined,
      upgrader: undefined,
    };
    if (rolesJson) {
      const p = path.resolve(rolesJson);
      if (!fs.existsSync(p)) throw new Error(`rolesJson file not found: ${p}`);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const k of Object.keys(granted)) {
        if (parsed[k]) granted[k] = parsed[k];
      }
    } else if (allRoles) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(allRoles)) throw new Error(`Invalid --all-roles address: ${allRoles}`);
      for (const k of Object.keys(granted)) granted[k] = allRoles;
    }

    const impl = await hre.upgrades.erc1967.getImplementationAddress(proxy);

    const outDir = path.join(process.cwd(), 'deployments');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const file = path.join(outDir, `${network.name}.zarp.json`);
    if (fs.existsSync(file) && !overwrite) {
      throw new Error(`Deployment record already exists at ${file}; use --overwrite to replace.`);
    }

    const record = {
      network: network.name,
      proxy,
      implementation: impl,
      deployer,
      timestamp: new Date().toISOString(),
      granted,
      renounced: false,
    };
    fs.writeFileSync(file, JSON.stringify(record, null, 2));
    const result = { action: 'backfill', file, record };

    if (archive) {
      try {
        writeArchive(network.name, 'backfill', record);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log('Backfilled deployment record:', result);
    }
  });
