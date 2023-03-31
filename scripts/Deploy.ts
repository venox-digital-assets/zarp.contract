import { ethers, upgrades, defender } from 'hardhat';

const ZARP_REPO_URL = 'https://github.com/venox-digital-assets/zarp.contract';

// First-time deployment of ZARP on a chain. Deploys implementation and proxy
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  console.log('Account balance:', (await deployer.getBalance()).toString());

  const Token = await ethers.getContractFactory('Zarp');
  const token = await upgrades.deployProxy(Token);

  console.log('Token address:', token.address);
  console.log('Token symbol:', await token.symbol());
  console.log('Token name:', await token.name());
  console.log('Token total supply:', await token.totalSupply());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
