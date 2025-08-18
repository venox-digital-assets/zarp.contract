import { ethers, upgrades } from 'hardhat';

// Simple non-Defender upgrade flow.
// Usage:
//   yarn hardhat run scripts/UpgradeSimple.ts --network <network> \
//     --proxy <PROXY_ADDRESS> --newImpl ZarpV2
// If --newImpl is omitted, defaults to 'ZarpV2'.

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const proxy: string | undefined = args.proxy || args.p;
  const newImplName: string = args.newImpl || 'ZarpV2';

  if (!proxy) {
    throw new Error('Missing --proxy <PROXY_ADDRESS>');
  }

  const [deployer] = await ethers.getSigners();
  console.log('Upgrading with deployer:', await deployer.getAddress());

  const NewImpl = await ethers.getContractFactory(newImplName);
  console.log('Prepared new implementation:', newImplName);

  const upgraded = await upgrades.upgradeProxy(proxy, NewImpl);
  await upgraded.waitForDeployment();

  const proxyAddr = await upgraded.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);
  console.log('Proxy upgraded at:', proxyAddr);
  console.log('New implementation address:', implAddr);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
