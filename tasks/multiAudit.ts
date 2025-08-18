import { task } from 'hardhat/config';
import { expectedCanonicalProxy } from './canonicalProxies';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/*
Task: zarp:multi-audit
Goal: For a list of networks, resolve the canonical (or recorded) proxy, read the implementation
      address (ERC1967), fetch runtime bytecode, normalize implementation-address word similar to
      bytecodeDiff masking, and compare keccak256 hash vs local artifact runtime (Zarp) to detect drift.

Outputs (JSON array by default):
  network, chainId, proxy, implementation, onChainHash, localHash, lengthDiff, matches, note

Behavior:
  - For each network, spins up a provider using the configured network RPC.
  - Skips network if no RPC URL or if connection/lookup fails (records error).
  - Local runtime is taken from artifacts/contracts/Zarp.sol/Zarp.json (deployedBytecode.object). If missing, task errors early.

Flags/params:
  --nets comma-separated network names (default: sepolia,polygonAmoy,baseSepolia,gnosisChiado)
  --json (default) raw JSON array
  --pretty human table output
*/

function normalizeRuntime(code: string, implementation?: string): string {
  if (!code) return code;
  let c = code.startsWith('0x') ? code.slice(2) : code;
  if (implementation) {
    const implWord = implementation.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    const wordRegex = new RegExp(implWord.padStart(64, '0'), 'g');
    c = c.replace(wordRegex, '0'.repeat(64));
  }
  return '0x' + c;
}

function keccakHex(hex: string): string {
  const data = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  // Node's crypto doesn't expose keccak256 directly pre-19; attempt createHash fallback; else throw.
  try {
    return '0x' + (crypto as any).createHash('keccak256').update(data).digest('hex');
  } catch {
    try {
      // @ts-ignore: require optional dependency if available
      const { keccak256 } = require('@ethersproject/keccak256');
      return keccak256(data);
    } catch (e2) {
      throw new Error(
        "keccakHex: Neither crypto.createHash('keccak256') nor @ethersproject/keccak256 is available. " +
          'Please use Node.js v19+ or install @ethersproject/keccak256.',
      );
    }
  }
}

task('zarp:multi-audit', 'Audit canonical Zarp implementation consistency across networks')
  .addOptionalParam('nets', 'Comma separated network names to audit')
  .addFlag('json', 'Emit JSON (default)')
  .addFlag('pretty', 'Pretty print table')
  .setAction(async (args, hre) => {
    const { nets, json, pretty } = args;
    const targetNets = (nets ? nets.split(',') : ['sepolia', 'polygonAmoy', 'baseSepolia', 'gnosisChiado'])
      .map((n: string) => n.trim())
      .filter(Boolean);

    const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'Zarp.sol', 'Zarp.json');
    if (!fs.existsSync(artifactPath)) throw new Error('Missing local artifact Zarp.json; run build/test first');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const localRuntime: string =
      artifact.deployedBytecode?.object || artifact.deployedBytecode?.object || artifact.deployedBytecode || artifact.bytecode;
    if (!localRuntime || localRuntime === '0x') throw new Error('Local runtime bytecode for Zarp not found in artifact');
    const localHash = keccakHex(localRuntime);

    const results: any[] = [];

    for (const netName of targetNets) {
      const netCfg: any = (hre.config.networks as any)[netName];
      if (!netCfg) {
        results.push({ network: netName, error: 'No network config' });
        continue;
      }
      const url = netCfg.url;
      if (!url) {
        results.push({ network: netName, error: 'No RPC url' });
        continue;
      }
      try {
        const provider = new (hre.ethers as any).JsonRpcProvider(url);
        const chainId = netCfg.chainId || Number((await provider.getNetwork()).chainId.toString());
        const proxy = expectedCanonicalProxy(chainId);
        if (!proxy) {
          results.push({ network: netName, chainId, error: 'No canonical proxy mapping' });
          continue;
        }
        const code = await provider.getCode(proxy);
        if (!code || code === '0x') {
          results.push({ network: netName, chainId, proxy, error: 'No code at proxy' });
          continue;
        }
        const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const raw = await provider.getStorage(proxy, implSlot);
        let implementation: string | undefined;
        if (raw && raw !== '0x' && raw.length === 66) {
          const addr = '0x' + raw.slice(26);
          if (/^0x[0-9a-fA-F]{40}$/.test(addr)) implementation = addr;
        }
        if (!implementation) {
          results.push({ network: netName, chainId, proxy, error: 'Failed to decode implementation slot', raw });
          continue;
        }
        const implCode = await provider.getCode(implementation);
        if (!implCode || implCode === '0x') {
          results.push({ network: netName, chainId, proxy, implementation, error: 'No code at implementation' });
          continue;
        }
        const normalizedOnChain = normalizeRuntime(implCode, implementation);
        const onChainHash = keccakHex(normalizedOnChain);
        const matches = onChainHash === localHash;
        results.push({
          network: netName,
          chainId,
          proxy,
          implementation,
          onChainHash,
          localHash,
          matches,
          lengthDiff: implCode.length - localRuntime.length,
        });
      } catch (e: any) {
        results.push({ network: netName, error: e?.message || String(e) });
      }
    }

    if (json || !pretty) {
      console.log(JSON.stringify(results));
    } else {
      console.log('Network        ChainId  Matches  Implementation                           Proxy');
      for (const r of results) {
        if (r.error) {
          console.log(`${r.network.padEnd(14)}  ${(r.chainId || '').toString().padEnd(7)}  ERR      ${r.error}`);
        } else {
          console.log(
            `${r.network.padEnd(14)}  ${r.chainId.toString().padEnd(7)}  ${r.matches ? 'YES ' : 'NO  '}  ${r.implementation}  ${r.proxy}`,
          );
        }
      }
    }
  });
