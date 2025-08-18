import { upgrades, ethers, network, run } from 'hardhat';
import minimist from 'minimist';

/*
Resolve proxy implementation address and run verification.

Usage:
  yarn hardhat run scripts/VerifyImpl.ts --network <network> --proxy <PROXY_ADDRESS> [--contract Zarp]

Notes:
  - For UUPS proxies, we verify the implementation contract.
  - Assumes constructor has no args (implementation of upgradeable has no direct constructor logic besides initializer pattern).
*/

async function main() {
  const args = minimist(process.argv.slice(2));
  const proxy: string | undefined = args.proxy || args.p;
  const contractName: string = args.contract || 'Zarp';

  if (!proxy) throw new Error('Missing --proxy <PROXY_ADDRESS>');

  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log('Proxy:', proxy);
  console.log('Implementation:', impl);
  console.log('Network:', network.name);

  // Hardhat verify task expects: address and optional constructor args.
  // Implementation for upgradeable should have no constructor args.
  try {
    await run('verify:verify', {
      address: impl,
      contract: `contracts/${contractName}.sol:${contractName}`,
      constructorArguments: [],
    });
    console.log('Verification submitted.');
  } catch (e: any) {
    if (e.message && e.message.toLowerCase().includes('already verified')) {
      console.log('Already verified.');
    } else {
      throw e;
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
