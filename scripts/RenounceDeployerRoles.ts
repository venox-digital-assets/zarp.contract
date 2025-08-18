import { ethers } from 'hardhat';
import minimist from 'minimist';
import type { Zarp as ZarpType } from '../typechain-types/contracts/Zarp';

/*
Safely renounce selected roles from the deployer (or current signer) AFTER they
have been transferred to governance addresses (e.g., a Gnosis Safe).

Usage:
  yarn hardhat run scripts/RenounceDeployerRoles.ts --network <network> \
    --proxy <PROXY_ADDRESS> --roles DEFAULT_ADMIN_ROLE,UPGRADER_ROLE \
    [--holder <ALTERNATE_SIGNER_FOR_RENOUNCE>]

Logic:
  - For each role name provided, fetch its bytes32 identifier via zarp.ROLE_NAME().
  - Check that at least one OTHER account (not the renouncer) holds the role.
  - If safe to renounce, call renounceRole.
  - Skips roles not currently held by renouncer.

Exit code non‑zero on first failed safety check (unless --force is supplied).
*/

async function main() {
  const args = minimist(process.argv.slice(2));
  const proxy: string | undefined = args.proxy || args.p;
  if (!proxy) throw new Error('Missing --proxy <PROXY_ADDRESS>');
  const rolesArg: string | undefined = args.roles || args.r;
  if (!rolesArg) throw new Error('Missing --roles <CSV_ROLE_NAMES>');
  const force: boolean = !!args.force;

  const Factory = await ethers.getContractFactory('Zarp');
  const zarp = Factory.attach(proxy) as unknown as ZarpType;

  const renouncer = args.holder ? await ethers.getSigner(args.holder) : (await ethers.getSigners())[0];
  const renouncerAddr = await renouncer.getAddress();
  console.log('Renouncer:', renouncerAddr);

  const roleNames = rolesArg
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  for (const name of roleNames) {
    try {
      const id = await (zarp as any)[name]();
      const has = await zarp.hasRole(id, renouncerAddr);
      if (!has) {
        console.log(`Skip ${name}: renouncer does not hold role`);
        continue;
      }
      // Enumerability: AccessControl doesn't give member list; require override or external tracking.
      // We perform a safety heuristic: require a replacement address argument per role via --holder<Index> or explicit --safe<role>=addr pattern.
      const altHolderKey = `holder_${name}`; // e.g., --holder_DEFAULT_ADMIN_ROLE 0xSafe
      let replacement: string | undefined = args[altHolderKey];
      if (!replacement && args.safe) replacement = args.safe; // global fallback
      if (!replacement) {
        if (!force) {
          console.error(`No replacement provided for ${name}. Provide --holder_${name} <addr> or --safe <addr> or use --force.`);
          process.exitCode = 1;
          return;
        }
        console.warn(`Forcing renounce of ${name} with NO replacement check.`);
      } else {
        const ok = await zarp.hasRole(id, replacement).catch(() => false);
        if (!ok && !force) {
          console.error(`Replacement ${replacement} does not hold ${name}. Aborting.`);
          process.exitCode = 1;
          return;
        }
      }

      console.log(`Renouncing ${name}...`);
      const tx = await zarp.connect(renouncer).renounceRole(id, renouncerAddr);
      await tx.wait();
      console.log(`Renounced ${name}`);
    } catch (e) {
      console.error(`Error processing role ${name}:`, e);
      if (!force) {
        process.exitCode = 1;
        return;
      }
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
