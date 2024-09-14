import { ethers, upgrades, defender, network } from 'hardhat';
import { ContractFactory } from 'ethers'; // Use ethers.ContractFactory
import { formatEther } from 'ethers'; // Import formatEther directly from ethers

// Configuration
const UPGRADEABLE_ADDRESS = '0xb755506531786C8aC63B756BaB1ac387bACB0C04'; // Existing upgradeable address

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Get the address of the deployer
  const address = await deployer.getAddress();
  console.log('Deploying contracts with the account:', address);

  // Get the balance using the provider
  const balance = await ethers.provider.getBalance(address);
  console.log('Account balance:', formatEther(balance)); // Correctly using formatEther from ethers

  // Get the contract factory for Zarp
  const zarpFactory = (await ethers.getContractFactory('Zarp')) as unknown as ContractFactory;

  // Check if we're running locally
  if (network.name === 'localhost' || network.name === 'hardhat') {
    // Perform local upgrade using Hardhat's upgradeProxy
    console.log('Running on local network, performing direct upgrade...');

    const upgraded = await upgrades.upgradeProxy(UPGRADEABLE_ADDRESS, zarpFactory);
    console.log('Contract upgraded locally:', await upgraded.getAddress());
  } else {
    // Use OpenZeppelin Defender for testnet/mainnet upgrades
    console.log('Running on non-local network, using Defender for upgrade...');

    const proposal = await defender.proposeUpgradeWithApproval(UPGRADEABLE_ADDRESS, zarpFactory);

    console.log('Upgrade proposal created at:', proposal.url);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
