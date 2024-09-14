import { ethers, upgrades, network, defender } from 'hardhat';
import { Zarp__factory } from '../typechain-types/factories/contracts/Zarp__factory'; // Import the correct factory type

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Get the address of the deployer
  const address = await deployer.getAddress();
  console.log('Deploying contracts with the account:', address);

  // Get the balance using the provider
  const balance = await ethers.provider.getBalance(address);
  console.log('Account balance:', ethers.formatEther(balance)); // Correct for ethers v6

  // Get the contract factory for Zarp
  const zarpFactory: Zarp__factory = (await ethers.getContractFactory('Zarp')) as Zarp__factory;

  // // Check if we're running locally
  // if (network.name === 'localhost' || network.name === 'hardhat') {
  // Deploy the proxy using the contract factory
  const token = await upgrades.deployProxy(zarpFactory, [], { initializer: 'initialize' });
  // Log the deployed contract's details
  console.log('Token proxy address:', await token.getAddress()); // Use getAddress() in ethers v6 for contract address
  console.log('Token symbol:', await token.symbol());
  console.log('Token name:', await token.name());
  console.log('Token total supply:', (await token.totalSupply()).toString());
  // } else {
  //   // Use OpenZeppelin Defender for testnet/mainnet upgrades
  //   const upgradeApprovalProcess = await defender.getUpgradeApprovalProcess();
  //   if (upgradeApprovalProcess.address === undefined) {
  //     throw new Error(`Upgrade approval process with id ${upgradeApprovalProcess.approvalProcessId} has no assigned address`);
  //   }
  // const deployment = await defender.deployProxy(zarpFactory, [5, upgradeApprovalProcess.address], { initializer: 'initialize' });

  // await deployment.waitForDeployment();

  // console.log(`Contract deployed to ${await deployment.getAddress()}`);
  // }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
