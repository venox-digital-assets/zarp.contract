import { ethers } from 'hardhat';

/*
ForkCheck.ts
Quick diagnostic to verify Hardhat fork configuration.

Outputs:
- Whether MAINNET_FORK_URL env is set
- Chain ID (expect 11155111 for Sepolia fork)
- Current block number (or pinned fork block)
- Code byte length at canonical proxy address

Usage:
  yarn hardhat run scripts/ForkCheck.ts --network hardhat
*/

async function main() {
  const forkUrlSet = !!process.env.MAINNET_FORK_URL;
  const forkBlock = process.env.MAINNET_FORK_BLOCK;
  console.log('MAINNET_FORK_URL set? ', forkUrlSet);
  console.log('MAINNET_FORK_BLOCK:', forkBlock ?? '(unset -> latest)');

  const net = await ethers.provider.getNetwork();
  console.log('chainId:', net.chainId.toString());
  const block = await ethers.provider.getBlockNumber();
  console.log('current block:', block);

  const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
  const code = await ethers.provider.getCode(CANONICAL_PROXY_GLOBAL);
  const codeBytes = (code.length - 2) / 2;
  console.log('canonical code bytes at', CANONICAL_PROXY_GLOBAL, ':', codeBytes);

  if (net.chainId.toString() !== '11155111') {
    console.log('Note: chainId is not Sepolia (11155111); fork may not be active.');
  } else if (codeBytes === 0) {
    console.log('Canonical address has no code on this fork (expected if not yet deployed on Sepolia).');
  } else {
    console.log('Canonical address HAS code on this fork.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
