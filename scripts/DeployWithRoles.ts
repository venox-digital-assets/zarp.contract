import { ethers, upgrades } from 'hardhat';
import minimist from 'minimist';
import type { Zarp as ZarpType } from '../typechain-types/contracts/Zarp';

/*
Deploy proxy and (optionally) distribute roles to designated addresses, then (optionally) renounce them from deployer.

Usage examples:
  yarn hardhat run scripts/DeployWithRoles.ts --network sepolia \
    --minter 0xMINTER --verifier 0xVERIFIER --burner 0xBURNER --pauser 0xPAUSER --upgrader 0xSAFE --renounce

Flags:
  --minter <addr>
  --verifier <addr>
  --burner <addr>
  --pauser <addr>
  --upgrader <addr>
  --no-grant  (skip granting; just deploy)
  --renounce  (after granting, renounce each granted role from deployer)
*/

async function main() {
  const args = minimist(process.argv.slice(2));
  const { minter, verifier, burner, pauser, upgrader } = args;
  const doGrant: boolean = args.grant !== false && !args['no-grant'];
  const doRenounce: boolean = !!args.renounce;

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log('Deployer:', deployerAddr);

  const Factory = await ethers.getContractFactory('Zarp');
  const proxy = (await upgrades.deployProxy(Factory, [], { initializer: 'initialize' })) as unknown as ZarpType;
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log('Proxy deployed at:', proxyAddress);
  console.log('Implementation at:', implAddress);

  if (doGrant) {
    await grantIf(minter, 'MINTER_ROLE');
    await grantIf(verifier, 'VERIFIER_ROLE');
    await grantIf(burner, 'BURNER_ROLE');
    await grantIf(pauser, 'PAUSER_ROLE');
    await grantIf(upgrader, 'UPGRADER_ROLE');
  } else {
    console.log('Skipping grants (--no-grant)');
  }

  if (doGrant && doRenounce) {
    await renounceIf(minter, 'MINTER_ROLE');
    await renounceIf(verifier, 'VERIFIER_ROLE');
    await renounceIf(burner, 'BURNER_ROLE');
    await renounceIf(pauser, 'PAUSER_ROLE');
    await renounceIf(upgrader, 'UPGRADER_ROLE');
  }

  console.log('Deployment complete.');

  async function grantIf(addr: string | undefined, roleName: string) {
    if (!addr) return;
    const role = await (proxy as any)[roleName]();
    console.log(`Granting ${roleName} to ${addr} ...`);
    const tx = await proxy.grantRole(role, addr);
    await tx.wait();
  }

  async function renounceIf(addr: string | undefined, roleName: string) {
    if (!addr) return; // Only renounce if we granted
    const role = await (proxy as any)[roleName]();
    console.log(`Renouncing ${roleName} from deployer ...`);
    const tx = await proxy.renounceRole(role, deployerAddr);
    await tx.wait();
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
