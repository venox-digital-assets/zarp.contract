import { ethers } from 'hardhat';
import type { Zarp as ZarpType } from '../typechain-types/contracts/Zarp';

// Grant UPGRADER_ROLE to a target address (e.g., a Gnosis Safe).
// Usage:
//   yarn hardhat run scripts/GrantUpgrader.ts --network <network> \
//     --proxy <PROXY_ADDRESS> --grantee <ADDRESS>

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const proxy: string | undefined = args.proxy || args.p;
  const grantee: string | undefined = args.grantee || args.g;

  if (!proxy) throw new Error('Missing --proxy <PROXY_ADDRESS>');
  if (!grantee) throw new Error('Missing --grantee <ADDRESS>');

  const [sender] = await ethers.getSigners();
  console.log('Using sender:', await sender.getAddress());

  const Zarp = await ethers.getContractFactory('Zarp');
  const zarp = Zarp.attach(proxy) as unknown as ZarpType;

  const role = await zarp.UPGRADER_ROLE();
  const tx = await zarp.grantRole(role, grantee);
  console.log('Grant tx sent:', tx.hash);
  await tx.wait();
  console.log('Granted UPGRADER_ROLE to:', grantee);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
