import { ethers, upgrades } from 'hardhat';
import minimist from 'minimist';
import type { Zarp as ZarpType } from '../typechain-types/contracts/Zarp';

/*
Quick smoke inspection of a deployed proxy.

Usage:
  yarn hardhat run scripts/Smoke.ts --network <network> --proxy <PROXY_ADDRESS> [--accounts 0xA,0xB]

Outputs:
  - Proxy + implementation addresses
  - name, symbol, totalSupply
  - For each provided account: balances, verification status, roles held
*/

async function main() {
  const args = minimist(process.argv.slice(2));
  const proxy: string | undefined = args.proxy || args.p;
  if (!proxy) throw new Error('Missing --proxy <PROXY_ADDRESS>');
  const accounts: string[] = (args.accounts ? String(args.accounts).split(',') : []).filter(Boolean);

  const Factory = await ethers.getContractFactory('Zarp');
  const zarp = Factory.attach(proxy) as unknown as ZarpType;

  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log('Proxy:', proxy);
  console.log('Implementation:', impl);

  console.log('name:', await zarp.name());
  console.log('symbol:', await zarp.symbol());
  console.log('totalSupply:', (await zarp.totalSupply()).toString());

  if (accounts.length > 0) {
    const roles = ['DEFAULT_ADMIN_ROLE', 'MINTER_ROLE', 'PAUSER_ROLE', 'UPGRADER_ROLE', 'VERIFIER_ROLE', 'BURNER_ROLE'];
    console.log('\nAccounts:');
    for (const a of accounts) {
      const bal = await zarp.balanceOf(a).catch(() => 0n);
      const verified = await zarp.isVerified(a).catch(() => false);
      const roleStatus: Record<string, boolean> = {};
      for (const r of roles) {
        try {
          const id = await (zarp as any)[r]();
          roleStatus[r] = await zarp.hasRole(id, a);
        } catch {
          roleStatus[r] = false;
        }
      }
      console.log({ address: a, balance: bal.toString(), verified, roles: roleStatus });
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
