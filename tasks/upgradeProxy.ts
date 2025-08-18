import { task } from 'hardhat/config';
import path from 'path';
import fs from 'fs';
import { writeArchive } from './archiveUtil';

const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

task('zarp:upgrade', 'Upgrade the canonical Zarp proxy to the latest implementation (defaults vary by network)')
  .addOptionalParam(
    'impl',
    'Implementation contract name. Default: local networks prefer ZarpV2 (for testing), non-local networks prefer Zarp unless explicitly overridden.',
  )
  .addOptionalParam('proxy', 'Override proxy address (local fork / noncanonical simulation)')
  .addOptionalParam('from', 'Address to perform the upgrade (must hold UPGRADER_ROLE). On a fork, will impersonate if necessary.')
  .addFlag('force', 'Force upgrade even if implementation is placeholder / guarded for non-local networks')
  .addFlag('simulateRemote', 'Treat local network as remote for guard testing (forces placeholder guard without --force)')
  .addFlag('json', 'Emit JSON only')
  .addFlag('noSmoke', 'Skip post-upgrade smoke output (symbol/name/totalSupply/version)')
  .addFlag('noStatus', 'Skip automatic post-upgrade status output')
  .addFlag('archive', 'Persist upgrade result JSON under deployments/records/<network>/')
  .setAction(async (rawArgs: any, hre) => {
    const { impl, json, noSmoke, noStatus, archive, proxy: overrideProxy, from: fromAddress, force, simulateRemote } = rawArgs;
    const { ethers, upgrades, network } = hre as typeof hre & { upgrades: any };
    const isLocalNamed = network.name === 'hardhat' || network.name === 'localhost';
    const forked = !!(network as any).config?.forking;
    // On a forked hardhat network, treat canonical expected as GLOBAL, not LOCAL
    const isLocal = isLocalNamed && !forked;
    const expected = isLocal ? CANONICAL_PROXY_LOCAL : CANONICAL_PROXY_GLOBAL;

    // Resolve proxy address with optional override (for fork/local simulations of global canonical)
    const file = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
    let proxyAddress: string;
    let resolution: 'record' | 'canonical-fallback' | 'override';
    if (overrideProxy) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(overrideProxy)) throw new Error(`Invalid --proxy override: ${overrideProxy}`);
      proxyAddress = overrideProxy;
      resolution = 'override';
    } else if (fs.existsSync(file)) {
      try {
        const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
        proxyAddress = rec.proxy;
        if (!/^0x[0-9a-fA-F]{40}$/.test(proxyAddress)) throw new Error('invalid proxy field');
        resolution = 'record';
      } catch (e: any) {
        throw new Error(`Failed to parse deployment record: ${e?.message || e}`);
      }
      if (proxyAddress.toLowerCase() !== expected.toLowerCase() && !isLocal) {
        throw new Error(`Deployment record proxy ${proxyAddress} != canonical expected ${expected} on ${network.name}; aborting upgrade.`);
      }
    } else {
      // No local record
      const codeAtExpected = await ethers.provider.getCode(expected);
      if (!codeAtExpected || codeAtExpected === '0x') {
        throw new Error(
          `No deployment record and no contract code at expected canonical ${expected} on ${network.name}; deploy:roles first.`,
        );
      }
      proxyAddress = expected;
      resolution = 'canonical-fallback';
    }

    const code = await ethers.provider.getCode(proxyAddress);
    if (!code || code === '0x') {
      throw new Error(`No contract code found at resolved canonical proxy ${proxyAddress} (expected ${expected}) on ${network.name}.`);
    }

    // Select signer (default first signer unless --from supplied)
    let signer = (await ethers.getSigners())[0];
    if (fromAddress) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress)) throw new Error(`Invalid --from address: ${fromAddress}`);
      const fromChecksummed = ethers.getAddress(fromAddress);
      const currentAddr = await signer.getAddress();
      if (currentAddr.toLowerCase() !== fromChecksummed.toLowerCase()) {
        if (isLocalNamed) {
          try {
            await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [fromChecksummed] });
          } catch (e: any) {
            throw new Error(`Failed to impersonate ${fromChecksummed}: ${e?.message || e}`);
          }
          signer = await ethers.getSigner(fromChecksummed);
          const bal = await ethers.provider.getBalance(fromChecksummed);
          const threshold = ethers.parseEther('0.05');
          if (bal < threshold) {
            try {
              const fundTx = await (await ethers.getSigners())[0].sendTransaction({ to: fromChecksummed, value: ethers.parseEther('1') });
              await fundTx.wait();
            } catch (e: any) {
              throw new Error(`Failed to fund impersonated account ${fromChecksummed}: ${e?.message || e}`);
            }
          }
        } else {
          signer = await ethers.getSigner(fromChecksummed);
        }
      }
    }

    // Determine implementation factory
    let targetImplName = impl as string | undefined;
    if (!targetImplName) {
      const artifactsDir = path.join(process.cwd(), 'artifacts', 'contracts');
      const hasV2 = fs.existsSync(path.join(artifactsDir, 'ZarpV2.sol'));
      // Safety: default to Zarp on non-local networks unless user explicitly requests ZarpV2
      if (hasV2) {
        targetImplName = isLocal ? 'ZarpV2' : 'Zarp';
      } else {
        targetImplName = 'Zarp';
      }
    }
    const Factory = await ethers.getContractFactory(targetImplName, signer);
    const signerAddr = await signer.getAddress();
    // Guard: block ZarpV2 upgrades on non-local networks (or when simulateRemote) unless --force is provided
    const guardApplies = (!isLocal || simulateRemote) && targetImplName === 'ZarpV2' && !force;
    if (guardApplies) {
      throw new Error('Blocked: ZarpV2 is currently a placeholder. Refusing to upgrade proxy on non-local network without --force flag.');
    }
    if (!json)
      console.log(`Upgrading canonical proxy ${proxyAddress} on ${network.name} to implementation ${targetImplName} as ${signerAddr} ...`);

    // Pre-check UPGRADER_ROLE if contract exposes AccessControl (avoid revert noise)
    try {
      const accessAbiNameCandidates = ['ZarpV2', 'Zarp'];
      let access: any = null;
      for (const name of accessAbiNameCandidates) {
        try {
          access = await ethers.getContractAt(name, proxyAddress, signer);
          break;
        } catch {}
      }
      if (access) {
        const upgraderRole = ethers.id('UPGRADER_ROLE');
        const hasRole = await access.hasRole(upgraderRole, signerAddr);
        if (!hasRole) {
          throw new Error(`Signer ${signerAddr} lacks UPGRADER_ROLE (hash ${upgraderRole}). Provide an address with role via --from.`);
        }
      }
    } catch (roleErr: any) {
      throw roleErr;
    }

    const beforeImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory);
    await upgraded.waitForDeployment();
    const afterImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const resolvedProxy = await upgraded.getAddress();
    if (resolvedProxy.toLowerCase() !== proxyAddress.toLowerCase()) {
      throw new Error(`Invariant breach: upgraded proxy address changed (${resolvedProxy}) vs original ${proxyAddress}`);
    }

    // Optional smoke info
    let smoke: any = null;
    if (!noSmoke) {
      try {
        // Prefer ZarpV2 ABI (includes version()) if available
        let zarp: any;
        let symbol: string;
        let name: string;
        let totalSupply: bigint;
        let version: string | null = null;
        try {
          zarp = await ethers.getContractAt('ZarpV2', proxyAddress);
        } catch {
          zarp = await ethers.getContractAt('Zarp', proxyAddress);
        }
        [symbol, name, totalSupply] = await Promise.all([zarp.symbol(), zarp.name(), zarp.totalSupply()]);
        if (typeof zarp.version === 'function') {
          try {
            version = await zarp.version();
          } catch {
            version = null;
          }
        } else {
          // Low-level attempt: function version() external view returns (string)
          try {
            const selector = '0x54fd4d50'; // keccak256("version()") first 4 bytes
            const raw = await ethers.provider.call({ to: proxyAddress, data: selector });
            if (raw && raw !== '0x') {
              // Decode as string (dynamic): first 32 bytes offset, then length, then data
              // Simplify using ethers ABI coder
              const abi = ['function version() view returns (string)'];
              const iface = new ethers.Interface(abi);
              const decoded = iface.decodeFunctionResult('version', raw);
              if (decoded && decoded.length > 0) version = decoded[0];
            }
          } catch {}
        }
        smoke = { symbol, name, totalSupply: totalSupply.toString(), version };
      } catch (e: any) {
        smoke = { error: `Failed to gather smoke info: ${e?.message || e}` };
      }
    }
    const result = {
      network: network.name,
      forked,
      proxy: proxyAddress,
      implementationBefore: beforeImpl,
      implementationAfter: afterImpl,
      changed: beforeImpl.toLowerCase() !== afterImpl.toLowerCase(),
      targetImplName,
      resolution,
      from: signerAddr,
      smoke,
    };

    if (archive) {
      try {
        const fileArchive = writeArchive(network.name, 'upgrade', result);
        if (!json) console.log(`Archived upgrade -> ${fileArchive}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log('Upgrade result:', result);
      if (!result.changed) console.log('Note: Implementation address unchanged (idempotent upgrade?).');
      if (smoke) {
        if (!smoke.error) {
          console.log(
            `Smoke: symbol=${smoke.symbol} name="${smoke.name}" totalSupply=${smoke.totalSupply}${
              smoke.version ? ` version=${smoke.version}` : ''
            }`,
          );
        } else {
          console.log(smoke.error);
        }
      }
    }

    if (!noStatus) {
      try {
        await hre.run('zarp:status', { proxy: proxyAddress, json: !!json, archive });
      } catch (e: any) {
        console.warn(`Post-upgrade status failed: ${e?.message || e}`);
      }
    }
  });
