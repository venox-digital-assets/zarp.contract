import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy } from './canonicalProxies';

/*
Task: zarp:verify
Verifies the implementation (always) and optionally the proxy (ERC1967) on the current network.

Resolution order for proxy:
  1. --proxy override
  2. deployments/<network>.zarp.json (proxy field)
  3. canonical registry (expectedCanonicalProxy)

For implementation address:
  - Reads current implementation via upgrades.erc1967.getImplementationAddress(proxy)
  - If already verified (API returns success) it will skip silently unless --force.

Flags / params:
  --proxy <addr>    Override proxy (safety checks apply)
  --no-proxy        Skip proxy verification (implementation only)
  --force           Force attempt even if explorer reports already verified (retries)
  --json            JSON output only

Environment expectations:
  Gnosis mainnet (chainId 100) -> gnosisscan.io (Etherscan style API)
  Chiado (chainId 10200) -> Blockscout endpoint (added via customChains)

Notes:
  - Constructor args: none (UUPS initializer pattern). Provide empty array.
  - Hardhat verify plugin auto-flattens standard JSON when using verify:verify.
*/

task('zarp:verify', 'Verify proxy + implementation source on network explorer')
  .addOptionalParam('proxy', 'Proxy address override')
  .addOptionalParam('implementation', 'Implementation address override (skip on-chain resolution)')
  .addFlag('noProxy', 'Skip proxy verification')
  .addFlag('onlyProxy', 'Verify proxy only (requires --proxy or resolvable record)')
  .addFlag('onlyImplementation', 'Verify implementation only (skip proxy even if resolvable)')
  .addFlag('force', 'Force verification even if already verified')
  .addFlag('json', 'Emit JSON only')
  .setAction(async (args, hre) => {
    const { proxy: proxyOverride, implementation: implOverride, noProxy, onlyProxy, onlyImplementation, force, json } = args;
    if (onlyProxy && onlyImplementation) throw new Error('Cannot use --onlyProxy and --onlyImplementation together');
    const skipProxy = onlyImplementation || noProxy;
    const { ethers, upgrades, network } = hre as typeof hre & { upgrades: any };

    // Resolve chainId robustly
    let chainId = network.config.chainId as number | undefined;
    if (!chainId) {
      try {
        chainId = Number((await ethers.provider.getNetwork()).chainId.toString());
      } catch {}
    }
    if (chainId === undefined) throw new Error('Unable to resolve chainId');

    // Resolve proxy unless onlyImplementation with an override implementation supplied
    const recordPath = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
    let proxy: string | undefined;
    if (!onlyImplementation || !implOverride) {
      if (proxyOverride) {
        proxy = proxyOverride;
      } else if (fs.existsSync(recordPath)) {
        try {
          const rec = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
          if (rec?.proxy && /^0x[0-9a-fA-F]{40}$/.test(rec.proxy)) proxy = rec.proxy;
        } catch (e: any) {
          throw new Error(`Failed to parse deployment record: ${e?.message || e}`);
        }
      } else {
        proxy = expectedCanonicalProxy(chainId);
      }
      if (!onlyImplementation && !proxy) throw new Error('Unable to resolve proxy address (no override, no record, no canonical)');
      if (proxy && !/^0x[0-9a-fA-F]{40}$/.test(proxy)) throw new Error(`Invalid proxy address ${proxy}`);
    }

    let implementation: string | undefined = implOverride;
    if (implementation && !/^0x[0-9a-fA-F]{40}$/.test(implementation)) throw new Error(`Invalid implementation override ${implementation}`);

    if (!implementation) {
      if (!proxy) throw new Error('Cannot resolve implementation without proxy');
      const code = await ethers.provider.getCode(proxy);
      if (!code || code === '0x') throw new Error(`No contract code at proxy ${proxy}`);
      implementation = await upgrades.erc1967.getImplementationAddress(proxy);
    } else if (proxy) {
      // If override provided along with proxy, compare to actual on-chain implementation
      try {
        const actual = await upgrades.erc1967.getImplementationAddress(proxy);
        if (actual.toLowerCase() !== implementation.toLowerCase()) {
          const msg = `Warning: override implementation ${implementation} != on-chain implementation ${actual} for proxy ${proxy}`;
          if (json) {
            console.error(msg);
          } else {
            console.warn(msg);
          }
        }
      } catch {}
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(implementation!)) throw new Error(`Invalid implementation resolved: ${implementation}`);

    const implAddress: string = implementation!; // non-null after validation
    const results: any = { network: network.name, chainId, proxy: proxy || null, implementation: implAddress, steps: [] };

    // Helper to attempt verification and swallow "already verified" unless force
    async function attemptVerify(address: string, constructorArguments: any[] = []) {
      try {
        await hre.run('verify:verify', { address, constructorArguments });
        results.steps.push({ address, status: 'submitted' });
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (/already verified/i.test(msg) && !force) {
          results.steps.push({ address, status: 'already-verified' });
        } else {
          results.steps.push({ address, status: 'error', error: msg });
          throw e;
        }
      }
    }

    // Implementation (unless onlyProxy)
    if (!onlyProxy) {
      await attemptVerify(implAddress, []);
    }

    if (!skipProxy && proxy) {
      await attemptVerify(proxy, []);
    }

    if (json) {
      console.log(JSON.stringify(results));
    } else {
      console.log('Verification results:', results);
    }
  });
