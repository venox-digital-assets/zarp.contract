import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { writeArchive } from './archiveUtil';
import { expectedCanonicalProxy } from './canonicalProxies';
import { ROLE_NAMES, RoleName, censusRoles, executeRoleTransfer, planRoleTransfer } from './roleLib';

/*
Hardhat task: zarp:transfer-roles

Move roles from one holder (typically the deployer EOA) to another (typically a
governance Safe), in a safe order.

Ordering is not cosmetic. OZ revokeRole() requires the caller to still hold the
role's admin, so DEFAULT_ADMIN_ROLE is always surrendered LAST — dropping it
first strands every remaining role. Removal of the signer's own roles uses
renounceRole (no admin check); removal from a third party uses revokeRole.

DRY RUN BY DEFAULT. Nothing is sent unless --execute is passed.

Usage:
  # see the plan, send nothing
  yarn hardhat zarp:transfer-roles --network baseSepolia --to 0xSafe

  # only the operational roles, keep admin/upgrader where they are
  yarn hardhat zarp:transfer-roles --network baseSepolia --to 0xSafe --roles MINTER_ROLE,BURNER_ROLE

  # actually send the transactions
  yarn hardhat zarp:transfer-roles --network baseSepolia --to 0xSafe --execute --archive

Flags:
  --to <addr>        Destination holder (required)
  --from <addr>      Source holder (default: the configured signer)
  --roles <csv>      Subset of roles (default: all six)
  --execute          Actually send transactions (otherwise dry run)
  --no-grant         Skip grants; only remove from --from
  --no-revoke        Skip removals; only grant to --to
  --proxy <addr>     Override proxy (default: deployment record, else canonical registry)
  --from-block <n>   Start block for the census scan
  --chunk <n>        eth_getLogs window size
  --json             Emit JSON only
  --archive          Persist plan/result under deployments/records/<network>/ (label role-transfer)
*/

task('zarp:transfer-roles', 'Move roles from one holder to another (dry run unless --execute)')
  .addParam('to', 'Destination address that should end up holding the roles')
  .addOptionalParam('from', 'Source address to remove roles from (default: configured signer)')
  .addOptionalParam('roles', `Comma-separated subset of: ${ROLE_NAMES.join(',')}`)
  .addOptionalParam('proxy', "Proxy address or 'auto' (default)", 'auto')
  .addOptionalParam('fromBlock', 'Start block for the census scan')
  .addOptionalParam('chunk', 'eth_getLogs window size')
  .addFlag('execute', 'Send the transactions (default is a dry run)')
  .addFlag('noGrant', 'Do not grant to --to; only remove from --from')
  .addFlag('noRevoke', 'Do not remove from --from; only grant to --to')
  .addFlag('json', 'Emit JSON only')
  .addFlag('archive', 'Persist the plan/result under deployments/records/<network>/')
  .setAction(async (args, hre) => {
    const { to, execute, noGrant, noRevoke, json, archive } = args;
    const { ethers, network } = hre;

    let roles: readonly RoleName[] = ROLE_NAMES;
    if (args.roles) {
      const requested = String(args.roles)
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean);
      const unknown = requested.filter((r: string) => !ROLE_NAMES.includes(r as RoleName));
      if (unknown.length) throw new Error(`Unknown role(s): ${unknown.join(', ')}. Valid: ${ROLE_NAMES.join(', ')}`);
      roles = requested as RoleName[];
    }

    let chainId = network.config.chainId as number | undefined;
    if (chainId === undefined) {
      try {
        chainId = Number((await ethers.provider.getNetwork()).chainId);
      } catch {}
    }

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

    const [signer] = await ethers.getSigners();
    if (!signer) throw new Error('No signer configured for this network (set DEPLOYER_PRIVATE_KEY)');
    const signerAddress = await signer.getAddress();
    const from = args.from ?? signerAddress;

    const token = await ethers.getContractAt('contracts/Zarp.sol:Zarp', proxy, signer);

    // A full census is required, not just hasRole on `from`: the "would this
    // leave nobody as admin" guard needs to know about every other admin.
    const census = await censusRoles(token, ethers.provider, {
      proxy,
      fromBlock: args.fromBlock !== undefined ? Number(args.fromBlock) : undefined,
      chunkSize: args.chunk !== undefined ? Number(args.chunk) : undefined,
      onProgress: json ? undefined : (f, t, c) => console.error(`  scanned ${f}-${t}: ${c} logs`),
    });

    const toHasCode = (await ethers.provider.getCode(to)) !== '0x';

    const plan = planRoleTransfer({
      currentHolders: census.currentHolders,
      from,
      to,
      signer: signerAddress,
      roles,
      grant: !noGrant,
      revoke: !noRevoke,
      toHasCode,
      roleHashes: census.roleHashes,
    });

    if (!json) {
      console.log(`\nRole transfer plan — ${network.name} (chainId ${chainId})`);
      console.log(`Proxy:  ${proxy}`);
      console.log(`From:   ${plan.from}`);
      console.log(`To:     ${plan.to}${toHasCode ? ' (contract)' : ' (EOA)'}`);
      console.log(`Signer: ${plan.signer}\n`);
      if (plan.steps.length === 0) {
        console.log('Nothing to do — the destination already holds every transferable role.');
      } else {
        plan.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.action}(${s.role}, ${s.account})`));
      }
      for (const w of plan.warnings) console.log(`\nWARNING: ${w}`);
      if (!execute) console.log('\nDRY RUN — nothing sent. Re-run with --execute to apply.');
    }

    if (plan.steps.length > 0 && execute && !json) console.log('\nExecuting...');

    const result = await executeRoleTransfer(token, plan, {
      execute,
      onStep: (step, i, txHash) => {
        if (!json && txHash) console.log(`  ${String(i + 1).padStart(2)}. ${step.action}(${step.role}) -> ${txHash}`);
      },
    });

    // Re-census after a real execution so the archived record reflects reality.
    let after = null;
    if (result.executed) {
      after = (
        await censusRoles(token, ethers.provider, {
          proxy,
          fromBlock: census.scannedFrom,
          chunkSize: args.chunk !== undefined ? Number(args.chunk) : undefined,
        })
      ).currentHolders;
    }

    const report = {
      network: network.name,
      chainId,
      proxy,
      from: plan.from,
      to: plan.to,
      signer: plan.signer,
      roles,
      executed: result.executed,
      steps: plan.steps,
      warnings: plan.warnings,
      receipts: result.receipts,
      holdersBefore: census.currentHolders,
      holdersAfter: after,
      timestamp: new Date().toISOString(),
    };

    if (archive) {
      try {
        const file = writeArchive(network.name, 'role-transfer', report);
        if (!json) console.error(`Archived role transfer -> ${file}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (json) console.log(JSON.stringify(report));
    else if (result.executed) console.log('\nDone. Re-run zarp:role-census to confirm.');
  });
