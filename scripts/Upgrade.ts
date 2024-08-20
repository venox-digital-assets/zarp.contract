import { ethers, upgrades, defender } from 'hardhat';
import { ContractFactory } from 'ethers';

// Configuration
const UPGRADEABLE_ADDRESS = '0x613FDF5A52Da6964EE7DA342271f870aE8eA1514'; // Sepolia address
const APPROVAL_ADDRESS = '0xfA4EB9AA068B3b64348f42b142E270f28E2f86EB';
const ZARP_REPO_URL = 'https://github.com/venox-digital-assets/zarp.contract';
const ZARP_ADMIN_APPROVAL_PROCESS_ID = '87e2ddfe-20c2-445f-92b1-d4f2bafe3d3b';

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Get the address of the deployer
  const address = await deployer.getAddress();
  console.log('Deploying contracts with the account:', address);

  // Get the balance using the provider
  const balance = await ethers.provider.getBalance(address);
  console.log('Account balance:', ethers.formatEther(balance));

  // Get the contract factory for Zarp - need to do forced type wrangling, which I hate, but can't find a way around right now
  const TokenFactory = (await ethers.getContractFactory('Zarp')) as unknown as ContractFactory;

  // Propose the upgrade with approval using Defender
  const proposal = await defender.proposeUpgradeWithApproval(UPGRADEABLE_ADDRESS, TokenFactory, {
    approvalProcessId: ZARP_ADMIN_APPROVAL_PROCESS_ID,
  });

  console.log('Upgrade proposal created at:', proposal.url);

  // Verification step (if needed)
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
