import { ethers } from 'hardhat';
import minimist from 'minimist';
import { deployAndConfigure } from './lib/deployShared';

async function main() {
  // Parse CLI args for role assignments (legacy interface retained)
  const args = minimist(process.argv.slice(2));
  const targets = {
    admin: args.admin as string | undefined,
    minter: args.minter as string | undefined,
    pauser: args.pauser as string | undefined,
    upgrader: args.upgrader as string | undefined,
    verifier: args.verifier as string | undefined,
    burner: args.burner as string | undefined,
  };
  const renounceAll: boolean = Boolean(args['renounce-deployer-roles'] || args.renounce);
  const renounceAdmin: boolean = Boolean(args['renounce-admin']);
  await deployAndConfigure((ethers as any).hre || (require('hardhat') as any), targets, { renounceAll, renounceAdminOnly: renounceAdmin });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
