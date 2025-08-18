import { task } from 'hardhat/config';
import { writeArchive } from './archiveUtil';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy } from './canonicalProxies';

const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

/*
Hardhat task: zarp:status
Provides a consolidated status ("smoke + roles") for a Zarp proxy:
 - Token metadata: name, symbol, totalSupply, (version if implemented)
 - Canonical expectations and whether proxy matches network canonical
 - Role membership for supplied addresses (+ default signer) across key roles
 - Verification (isVerified) for supplied addresses (optional flag)

Usage examples:
  yarn hardhat zarp:status --network localhost
  yarn hardhat zarp:status --network localhost --addresses 0xAddr1,0xAddr2
  yarn hardhat zarp:status --network sepolia --json
  yarn hardhat zarp:status --proxy 0xCustomProxy --addresses 0xA,0xB --check-verified

Defaults:
  --proxy auto  -> loads deployments/<network>.zarp.json (if present) else canonical expected
  --addresses   -> optional comma-separated list; default uses only the first signer

Flags:
  --json           Emit JSON only
  --check-verified Include isVerified(address) for each address
*/

task('zarp:status', 'Report token metadata, canonical alignment, and role holdings for addresses')
  .addOptionalParam('proxy', "Proxy address or 'auto' (default)", 'auto')
  .addOptionalParam('addresses', 'DEPRECATED: comma-separated addresses to inspect (use repeated --address)')
  .addOptionalVariadicPositionalParam('address', 'One or more addresses (repeat flag)')
  .addFlag('json', 'Emit JSON only')
  .addFlag('checkVerified', 'Include isVerified(address) for each address')
  .addFlag('allowNoncanonical', 'Allow mismatch with registry expected canonical proxy (use ONLY for local dev)')
  .addFlag('archive', 'Persist snapshot JSON under deployments/records/<network>/')
  .setAction(async (input, hre) => {
    let { proxy, addresses, address, json, checkVerified, archive, allowNoncanonical } = input as any;
    const { network, ethers } = hre;
    const isLocalNamed = network.name === 'hardhat' || network.name === 'localhost';
    const forked = !!(network as any).config?.forking; // Hardhat retains chainId 31337 while forking
    // Resolve chainId robustly for environments where network.config.chainId may be undefined
    let chainId: number | undefined = network.config.chainId as number | undefined;
    if (chainId === undefined) {
      try {
        const net = await ethers.provider.getNetwork();
        chainId = Number(net.chainId);
      } catch {}
    }
    const registryExpected = chainId !== undefined ? expectedCanonicalProxy(chainId) : undefined;
    // If we're on a fork (hardhat + forking), treat as remote network for canonical expectations
    const expectedCanonical = forked
      ? CANONICAL_PROXY_GLOBAL
      : isLocalNamed
      ? CANONICAL_PROXY_LOCAL
      : registryExpected || CANONICAL_PROXY_GLOBAL;

    // Resolve proxy if auto
    if (proxy === 'auto') {
      const file = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
      if (fs.existsSync(file)) {
        try {
          const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (rec.proxy) proxy = rec.proxy;
        } catch {}
      } else {
        // Fallback to expected canonical (may or may not have code yet). On fork we want the *global* canonical
        proxy = expectedCanonical;
      }
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) {
      throw new Error(`Invalid proxy address: ${proxy}`);
    }

    // On-chain code check
    const code = await ethers.provider.getCode(proxy);
    const hasCode = code && code !== '0x';

    let token: any = null;
    if (hasCode) {
      // Try V2 first for version()
      try {
        token = await ethers.getContractAt('ZarpV2', proxy);
      } catch {
        token = await ethers.getContractAt('Zarp', proxy);
      }
    }

    let meta: any = null;
    if (token) {
      try {
        const [symbol, name, totalSupply] = await Promise.all([token.symbol(), token.name(), token.totalSupply()]);
        let version: string | null = null;
        if (typeof token.version === 'function') {
          try {
            version = await token.version();
          } catch {}
        }
        meta = { symbol, name, totalSupply: totalSupply.toString(), version };
      } catch (e: any) {
        meta = { error: e?.message || String(e) };
      }
    }

    // Role names if possible
    let roles: any = null;
    if (token) {
      try {
        roles = {
          DEFAULT_ADMIN_ROLE: await token.DEFAULT_ADMIN_ROLE(),
          MINTER_ROLE: await token.MINTER_ROLE(),
          PAUSER_ROLE: await token.PAUSER_ROLE(),
          UPGRADER_ROLE: await token.UPGRADER_ROLE(),
          VERIFIER_ROLE: await token.VERIFIER_ROLE(),
          BURNER_ROLE: await token.BURNER_ROLE(),
        };
      } catch {}
    }

    // Address list to inspect
    const addrs: string[] = [];
    if (address) {
      const arr: string[] = Array.isArray(address) ? address : [address];
      for (const a of arr) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Invalid --address value: ${a}`);
        addrs.push(a);
      }
    }
    if (addresses) {
      // Deprecated path
      if (!json) console.warn('Warning: --addresses is deprecated; use repeated --address flags');
      for (const a of addresses
        .split(',')
        .map((x: string) => x.trim())
        .filter(Boolean)) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Invalid address in deprecated list: ${a}`);
        if (!addrs.some(existing => existing.toLowerCase() === a.toLowerCase())) addrs.push(a);
      }
    }
    // Always include first signer (caller context) if not already present
    const [firstSigner] = await ethers.getSigners();
    const firstAddr = await firstSigner.getAddress();
    if (!addrs.some(a => a.toLowerCase() === firstAddr.toLowerCase())) addrs.unshift(firstAddr);

    // Role membership checks
    let addressInfo: any[] = [];
    if (token && roles) {
      for (const addr of addrs) {
        const entry: any = { address: addr };
        try {
          for (const [rName, rVal] of Object.entries(roles)) {
            entry[rName] = await token.hasRole(rVal, addr);
          }
          if (checkVerified && typeof token.isVerified === 'function') {
            try {
              entry.verified = await token.isVerified(addr);
            } catch {}
          }
        } catch (e: any) {
          entry.error = e?.message || String(e);
        }
        addressInfo.push(entry);
      }
    } else {
      addressInfo = addrs.map(a => ({ address: a, note: 'No code or roles unavailable' }));
    }

    const deploymentState = hasCode ? 'deployed' : 'absent';
    const status = {
      network: network.name,
      chainId,
      forked,
      expectedCanonical,
      proxyResolved: proxy,
      deploymentState,
      hasCode,
      expectedCanonicalMatch: proxy.toLowerCase() === expectedCanonical.toLowerCase(),
      metadata: meta,
      roles: roles ? Object.keys(roles) : null,
      addresses: addressInfo,
    };

    // Enforce mismatch failure if registry has an expectation recorded and flag not provided
    if (registryExpected && status.expectedCanonicalMatch === false && !allowNoncanonical) {
      const msg = `Canonical mismatch: registry expects ${registryExpected} but resolved proxy ${proxy}`;
      if (json) {
        console.error(msg);
      } else {
        console.error(msg);
      }
      // Still archive (if flag) before throwing? Archive already attempted above; fine to throw now.
      throw new Error(msg);
    }

    if (archive) {
      try {
        const file = writeArchive(network.name, 'status', status);
        if (!json) console.log(`Archived status -> ${file}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }
    if (json) {
      console.log(JSON.stringify(status));
      return;
    }
    if (!hasCode) {
      console.log('Zarp status (no deployment yet at resolved proxy):', status);
      console.log('Note: deploymentState="absent" indicates no proxy code present; run deploy:roles to deploy.');
    } else {
      console.log('Zarp status:', status);
    }
  });
