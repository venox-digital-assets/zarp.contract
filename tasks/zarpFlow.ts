import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import type { Zarp } from '../typechain-types/contracts/Zarp';
import { writeArchive } from './archiveUtil';
import { DISALLOWED_NETWORKS } from './constants';

/*
Hardhat task: zarp:flow
Runs a local demonstration flow against a deployed proxy:
1. (Optional) verify an address (if --verify <addr>)
2. Mint tokens to a verified address
3. Transfer part of the balance to a burner address (must have BURNER_ROLE)
4. Burn a specified amount from that burner address

Usage (addresses must be explicit full 42-char 0x addresses; proxy auto-resolved):
  yarn hardhat zarp:flow --verifier 0xVerifier --minter 0xMinter --burner 0xBurner --recipient 0xRecipient --mint-amount 1000 --transfer-amount 250 --burn-amount 100

Flags:
  --skip-verify  Do not call verify() (assume recipient already verified)
  --json         Emit JSON summary only

Safety:
  - Requires you pass correct role-holding addresses; task will assert each role before actions.
*/

task('zarp:flow', 'Demonstrate verify -> mint -> transfer -> burn flow (auto-resolves canonical proxy)')
  .addParam('verifier', 'Address that holds VERIFIER_ROLE')
  .addParam('minter', 'Address that holds MINTER_ROLE')
  .addParam('burner', 'Address that holds BURNER_ROLE (destination of transfer & burn source)')
  .addParam('recipient', 'Address to receive initial mint (will be verified if not skipping)')
  .addParam('mintAmount', 'Amount to mint (integer, in whole token smallest units)', undefined, undefined, true)
  .addParam('transferAmount', 'Amount to transfer to burner', undefined, undefined, true)
  .addParam('burnAmount', 'Amount to burn from burner address', undefined, undefined, true)
  .addFlag('skipVerify', 'Skip verify() call for recipient')
  .addFlag('json', 'Emit JSON summary')
  .addFlag('noStatus', 'Skip automatic post-flow status output')
  .addFlag('preStatus', 'Emit status before executing the flow')
  .addFlag('archive', 'Persist flow summary JSON under deployments/records/<network>/')
  .setAction(async (args, hre) => {
    let { verifier, minter, burner, recipient, mintAmount, transferAmount, burnAmount, skipVerify, json, noStatus, preStatus, archive } =
      args as any;
    const { ethers, network } = hre;

    if (DISALLOWED_NETWORKS.has(network.name)) {
      throw new Error(`zarp:flow is restricted to local/test networks. Refusing to run on ${network.name}.`);
    }

    const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
    const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    const isLocal = network.name === 'hardhat' || network.name === 'localhost';
    const expectedCanonical = isLocal ? CANONICAL_PROXY_LOCAL : CANONICAL_PROXY_GLOBAL;
    const file = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`No deployment record found at ${file}. Run deploy:roles first (network ${network.name}).`);
    }
    let proxy: string;
    try {
      const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
      proxy = rec.proxy;
      if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) throw new Error('invalid proxy in record');
    } catch (e: any) {
      throw new Error(`Failed to load proxy from deployment record: ${e?.message || e}`);
    }
    if (proxy.toLowerCase() !== expectedCanonical.toLowerCase()) {
      throw new Error(`Deployment record proxy ${proxy} != canonical expected ${expectedCanonical} on ${network.name}`);
    }
    if (!json) console.log(`Using canonical proxy ${proxy}`);

    const allAddresses = { verifier, minter, burner, recipient };
    for (const [label, addr] of Object.entries(allAddresses)) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        throw new Error(`Invalid ${label} address: ${addr}`);
      }
    }

    // Quick on-chain code existence check to fail fast if proxy address not a contract on this network
    const code = await ethers.provider.getCode(proxy);
    if (code === '0x') {
      throw new Error(`No contract code at ${proxy}. Did you:
- Deploy on a different network? (If you ran 'hardhat node' use --network localhost)
- Use the implementation instead of the proxy address?
`);
    }

    const zarp = (await ethers.getContractAt('Zarp', proxy)) as unknown as Zarp;

    if (preStatus) {
      try {
        await hre.run('zarp:status', { proxy, address: [verifier, minter, burner, recipient], json: !!json });
      } catch (e: any) {
        if (!json) console.warn(`Pre-flow status failed: ${e?.message || e}`);
      }
    }

    const [defaultSigner, ...rest] = await ethers.getSigners();
    const addrMap: Record<string, string> = {
      verifier,
      minter,
      burner,
      recipient,
    };

    let roleNames: { VERIFIER_ROLE: string; MINTER_ROLE: string; BURNER_ROLE: string };
    try {
      roleNames = {
        VERIFIER_ROLE: await zarp.VERIFIER_ROLE(),
        MINTER_ROLE: await zarp.MINTER_ROLE(),
        BURNER_ROLE: await zarp.BURNER_ROLE(),
      };
    } catch (e: any) {
      throw new Error(`Failed to read role constants from proxy at ${proxy}. Original error: ${e?.message || e}
Hints:
- Ensure you passed the proxy (not implementation) address.
- If your node is started via 'yarn hardhat node', add '--network localhost' to this task.
- Confirm the deployment completed successfully.
`);
    }

    // Helper to get a signer by address
    const signerFor = async (address: string) => {
      for (const s of [defaultSigner, ...rest]) {
        const sAddr = (await s.getAddress()).toLowerCase();
        if (sAddr === address.toLowerCase()) return s;
      }
      // Fallback impersonation only for hardhat/localhost
      if (network.name === 'hardhat' || network.name === 'localhost') {
        await ethers.provider.send('hardhat_impersonateAccount', [address]);
        return await ethers.getSigner(address);
      }
      throw new Error(`No signer available for ${address}; provide a local account or run on a dev network with impersonation.`);
    };

    // Assertions for roles
    const hasRole = async (role: string, address: string) => await zarp.hasRole(role, address);
    const assertRole = async (roleKey: keyof typeof roleNames, address: string) => {
      const ok = await hasRole(roleNames[roleKey], address);
      if (!ok) throw new Error(`Address ${address} missing required role ${roleKey}`);
    };

    await assertRole('VERIFIER_ROLE', verifier);
    await assertRole('MINTER_ROLE', minter);
    await assertRole('BURNER_ROLE', burner);

    // Step 1: verify recipient (if not skipped)
    if (!skipVerify) {
      const vSigner = await signerFor(verifier);
      const already = await zarp.isVerified(recipient);
      if (!already) {
        const tx = await zarp.connect(vSigner).verify(recipient);
        await tx.wait();
      }
    }

    // Step 2: mint
    const mSigner = await signerFor(minter);
    const mintTx = await zarp.connect(mSigner).mint(recipient, BigInt(mintAmount));
    await mintTx.wait();

    // Step 3: transfer to burner
    const rSigner = await signerFor(recipient);
    const transferTx = await zarp.connect(rSigner).transfer(burner, BigInt(transferAmount));
    await transferTx.wait();

    // Step 4: burn from burner (burner must hold its own balance now)
    const bSigner = await signerFor(burner);
    const burnTx = await zarp.connect(bSigner).burn(BigInt(burnAmount));
    await burnTx.wait();

    const finalRecipientBal = await zarp.balanceOf(recipient);
    const finalBurnerBal = await zarp.balanceOf(burner);
    const totalSupply = await zarp.totalSupply();

    const summary = {
      proxy,
      recipient,
      burner,
      minted: mintAmount,
      transferred: transferAmount,
      burned: burnAmount,
      finalRecipientBalance: finalRecipientBal.toString(),
      finalBurnerBalance: finalBurnerBal.toString(),
      totalSupply: totalSupply.toString(),
    };
    if (archive) {
      try {
        const file = writeArchive(network.name, 'flow', summary);
        if (!json) console.log(`Archived flow -> ${file}`);
      } catch (e: any) {
        if (!json) console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (json) {
      console.log(JSON.stringify(summary));
    } else {
      console.log('Flow completed:', summary);
    }
    if (!noStatus) {
      try {
        await hre.run('zarp:status', { proxy, address: [verifier, minter, burner, recipient], json: !!json, archive });
      } catch (e: any) {
        if (!json) console.warn(`Post-flow status failed: ${e?.message || e}`);
      }
    }
  });
