import { ethers, upgrades, defender, network } from 'hardhat';
import { ContractFactory } from 'ethers'; // Use ethers.ContractFactory
import { formatEther } from 'ethers'; // Import formatEther directly from ethers

// Configuration
const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

function canonicalForNetwork(net: string): string {
  return net === 'hardhat' || net === 'localhost' ? CANONICAL_PROXY_LOCAL : CANONICAL_PROXY_GLOBAL;
}

function assertCanonical(address: string, net: string) {
  const expected = canonicalForNetwork(net);
  if (address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Refusing upgrade: target proxy ${address} != canonical ${expected} for network ${net}`);
  }
}

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

    const target = canonicalForNetwork(network.name);
    assertCanonical(target, network.name);
    const upgraded = await upgrades.upgradeProxy(target, zarpFactory);
    console.log('Contract upgraded locally:', await upgraded.getAddress());
  } else {
    // Use OpenZeppelin Defender for testnet/mainnet upgrades
    console.log('Running on non-local network, using Defender for upgrade...');

    const target = canonicalForNetwork(network.name);
    assertCanonical(target, network.name);
    const proposal = await defender.proposeUpgradeWithApproval(target, zarpFactory);

    console.log('Upgrade proposal created at:', proposal.url);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
