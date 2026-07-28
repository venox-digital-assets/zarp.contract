import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { writeArchive } from './archiveUtil';
import { expectedCanonicalProxy } from './canonicalProxies';
import { ROLE_NAMES, censusRoles, DEFAULT_CHUNK_SIZE } from './roleLib';

/*
Hardhat task: zarp:role-census

Enumerate EVERY holder of EVERY role on the Zarp proxy.

Why this exists: Zarp inherits AccessControlUpgradeable, not the Enumerable
variant, so role membership cannot be read from chain state. zarp:audit-admins
answers a much narrower question — it checks DEFAULT_ADMIN_ROLE only, and only
for addresses it already knows (the deployment record's admin and deployer).
An address granted MINTER_ROLE after deploy is invisible to it.

This task replays RoleGranted/RoleRevoked from the proxy's creation block and
re-confirms each candidate with hasRole(), which is the only complete method.

Usage:
  yarn hardhat zarp:role-census --network baseSepolia --pretty
  yarn hardhat zarp:role-census --network base --json --archive

Flags:
  --proxy <addr|auto>   Proxy to audit (default: deployment record, else canonical registry)
  --from-block <n>      Start block (default: binary-searched proxy creation block)
  --chunk <n>           eth_getLogs window size (default 400000; lower it if the RPC rejects the range)
  --json                Emit JSON only
  --pretty              Human-readable table
  --archive             Persist snapshot under deployments/records/<network>/ (label role-census)
*/

task('zarp:role-census', 'Enumerate all holders of all roles by replaying role events')
  .addOptionalParam('proxy', "Proxy address or 'auto' (default)", 'auto')
  .addOptionalParam('fromBlock', 'Start block for the log scan (default: proxy creation block)')
  .addOptionalParam('chunk', `eth_getLogs window size (default ${DEFAULT_CHUNK_SIZE})`)
  .addFlag('json', 'Emit JSON only')
  .addFlag('pretty', 'Pretty-print a summary table')
  .addFlag('archive', 'Persist snapshot JSON under deployments/records/<network>/')
  .setAction(async (args, hre) => {
    const { json, pretty, archive } = args;
    const { ethers, network } = hre;

    let chainId = network.config.chainId as number | undefined;
    if (chainId === undefined) {
      try {
        chainId = Number((await ethers.provider.getNetwork()).chainId);
      } catch {}
    }

    // Resolve proxy: explicit flag, else deployment record, else canonical registry.
    let proxy: string = args.proxy;
    if (proxy === 'auto') {
      const file = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
      let resolved: string | undefined;
      if (fs.existsSync(file)) {
        try {
          resolved = JSON.parse(fs.readFileSync(file, 'utf8'))?.proxy;
        } catch {}
      }
      proxy = resolved || (chainId !== undefined ? expectedCanonicalProxy(chainId) : undefined) || '';
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) {
      throw new Error(`Could not resolve a proxy address for network ${network.name} (got: ${proxy || 'none'})`);
    }
    if ((await ethers.provider.getCode(proxy)) === '0x') {
      throw new Error(`No contract code at ${proxy} on ${network.name}`);
    }

    const token = await ethers.getContractAt('contracts/Zarp.sol:Zarp', proxy);
    const census = await censusRoles(token, ethers.provider, {
      proxy,
      fromBlock: args.fromBlock !== undefined ? Number(args.fromBlock) : undefined,
      chunkSize: args.chunk !== undefined ? Number(args.chunk) : undefined,
      onProgress: json ? undefined : (from, to, count) => console.error(`  scanned ${from}-${to}: ${count} logs`),
    });

    const expected = chainId !== undefined ? expectedCanonicalProxy(chainId) : undefined;
    const report = {
      network: network.name,
      chainId,
      ...census,
      expectedCanonical: expected ?? null,
      expectedCanonicalMatch: expected ? expected.toLowerCase() === proxy.toLowerCase() : null,
      timestamp: new Date().toISOString(),
    };

    if (archive) {
      try {
        const file = writeArchive(network.name, 'role-census', report);
        if (!json) console.error(`Archived role census -> ${file}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (json || !pretty) {
      console.log(JSON.stringify(report, null, json ? 0 : 2));
      return;
    }

    console.log(`\nZarp role census — ${report.network} (chainId ${report.chainId})`);
    console.log(`Proxy:   ${census.proxy}${report.expectedCanonicalMatch === false ? '  *** NOT THE CANONICAL ADDRESS ***' : ''}`);
    console.log(`Scanned: blocks ${census.scannedFrom} .. ${census.scannedTo}\n`);
    for (const role of ROLE_NAMES) {
      const holders = census.currentHolders[role];
      console.log(`${role.padEnd(20)} ${holders.length === 0 ? '(nobody)' : holders.join('\n'.padEnd(22))}`);
    }
    if (census.verifiedAddresses.length) {
      console.log(`\nVerified addresses (${census.verifiedAddresses.length}):`);
      for (const a of census.verifiedAddresses) console.log(`  ${a}`);
    }
    const nonStandardAdmins = ROLE_NAMES.filter(r => census.roleAdmins[r] !== 'DEFAULT_ADMIN_ROLE');
    if (nonStandardAdmins.length) {
      console.log(`\nWARNING: non-standard role admins: ${nonStandardAdmins.map(r => `${r} -> ${census.roleAdmins[r]}`).join(', ')}`);
    }
    if (census.currentHolders.DEFAULT_ADMIN_ROLE.length === 0) {
      console.log('\nWARNING: no account holds DEFAULT_ADMIN_ROLE; roles can no longer be granted or revoked.');
    }
  });
