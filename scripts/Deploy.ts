import { ethers, upgrades } from 'hardhat';
import { ContractFactory } from 'ethers';
import { Zarp } from '../typechain-types/contracts/Zarp'; // Ensure the correct path

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Get the address of the deployer
  const address = await deployer.getAddress();
  console.log('Deploying contracts with the account:', address);

  // Get the balance using the provider
  const balance = await ethers.provider.getBalance(address);
  console.log('Account balance:', ethers.formatEther(balance));

  // Get the contract factory for Zarp
  const TokenFactory = (await ethers.getContractFactory('Zarp')) as unknown as ContractFactory;

  // Deploy the proxy using the contract factory
  const token = (await upgrades.deployProxy(TokenFactory)) as unknown as Zarp;
  
  // Log the deployed contract's details
  console.log('Token address:', token.target);
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
