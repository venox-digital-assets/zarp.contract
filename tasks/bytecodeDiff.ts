import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy, CANONICAL_PROXY_ADDRESS } from './canonicalProxies';

/*
Task: zarp:bytecode-diff
Diagnostic utility: fetches on-chain implementation bytecode (via ERC1967) and compares with local artifact deployedBytecode.

Usage:
  yarn hardhat zarp:bytecode-diff --network sepolia [--proxy 0x...] [--json]

Outputs:
  diff: true/false, lengths, first differing offset (if any), small hexdump slice around diff.
*/

task('zarp:bytecode-diff', 'Compare on-chain implementation bytecode with local artifact')
  .addOptionalParam('proxy', 'Proxy address override')
  .addFlag('json', 'Emit JSON only')
  .setAction(async (args, hre) => {
    const { proxy: proxyOverride, json } = args;
    const { ethers, upgrades, network } = hre as typeof hre & { upgrades: any };
    const forked = !!(network as any).config?.forking;

    // Resolve chainId
    let chainId = network.config.chainId as number | undefined;
    if (!chainId) {
      chainId = Number((await ethers.provider.getNetwork()).chainId.toString());
    }
    if (chainId === undefined) throw new Error('Unable to resolve chainId');

    // Resolve proxy (same logic as verify task)
    const recordPath = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
    let proxy: string | undefined;
    if (proxyOverride) {
      proxy = proxyOverride;
    } else if (fs.existsSync(recordPath)) {
      try {
        const rec = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
        if (rec?.proxy && /^0x[0-9a-fA-F]{40}$/.test(rec.proxy)) proxy = rec.proxy;
      } catch (e: any) {
        throw new Error(`Failed to parse deployment record: ${e?.message || e}`);
      }
    } else if (forked) {
      // Forked hardhat: use global canonical (the fork replicates remote chain state)
      proxy = CANONICAL_PROXY_ADDRESS;
    } else {
      // Non-fork, fall back to registry mapping by chainId (may be undefined if chain not listed)
      proxy = expectedCanonicalProxy(chainId);
    }

    if (!proxy) throw new Error('Unable to resolve proxy address');
    if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) throw new Error(`Resolved proxy is not a valid address: ${proxy}`);

    const implementation = await upgrades.erc1967.getImplementationAddress(proxy);
    const onChain = await ethers.provider.getCode(implementation);
    if (!onChain || onChain === '0x') throw new Error('No code at implementation');

    // Load artifact (Zarp as authoritative local canonical implementation)
    const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'Zarp.sol', 'Zarp.json');
    if (!fs.existsSync(artifactPath)) throw new Error('Artifact not found for Zarp');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    let local = (artifact.deployedBytecode?.object || artifact.deployedBytecode || artifact.bytecode || '')
      .toLowerCase()
      .replace(/^0x/, '');
    let onChainStripped = onChain.toLowerCase().replace(/^0x/, '');

    // Normalize implementation self-address push differences: replace any 32-byte word equal to impl address (padded) with zeros in both
    const implWord = implementation.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const zeroWord = '0'.repeat(64);
    const wordRegex = new RegExp(implWord, 'g');
    onChainStripped = onChainStripped.replace(wordRegex, zeroWord);
    // Some compilers embed zeros locally; ensure local also normalizes any implWord just in case
    local = local.replace(wordRegex, zeroWord);

    const result: any = {
      network: network.name,
      chainId,
      forked,
      proxy,
      implementation,
      localLength: local.length / 2,
      onChainLength: onChainStripped.length / 2,
    };

    if (!local) {
      result.error = 'Local deployedBytecode missing in artifact';
    } else {
      const max = Math.min(local.length, onChainStripped.length);
      let diffIndex = -1;
      for (let i = 0; i < max; i += 2) {
        if (local.slice(i, i + 2) !== onChainStripped.slice(i, i + 2)) {
          diffIndex = i;
          break;
        }
      }
      if (diffIndex === -1 && local.length !== onChainStripped.length) diffIndex = max;
      result.matches = diffIndex === -1;
      if (diffIndex !== -1) {
        result.firstDiffByte = diffIndex / 2;
        const contextBytes = 20;
        const start = Math.max(0, diffIndex - contextBytes * 2);
        const end = Math.min(onChainStripped.length, diffIndex + contextBytes * 2);
        result.onChainSlice = onChainStripped.slice(start, end);
        result.localSlice = local.slice(start, end);
      }
    }

    if (json) console.log(JSON.stringify(result));
    else console.log('Bytecode diff result:', result);
  });
