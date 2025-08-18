import { task } from 'hardhat/config';
import { expectedCanonicalProxy, CANONICAL_PROXY_ADDRESS } from './canonicalProxies';
import fs from 'fs';
import path from 'path';

/*
Task: zarp:impl-slot
Reads the ERC1967 implementation slot for a proxy (default canonical) and prints:
  - slot constant (bytes32)
  - raw storage value at that slot
  - decoded implementation address
  - implementation address per upgrades.erc1967.getImplementationAddress (sanity cross-check)
Resolution order for proxy:
  1. --proxy override
  2. deployments/<network>.zarp.json (proxy field)
  3. canonical registry (expectedCanonicalProxy)
Output: JSON unless --pretty flag used.
*/

const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'; // EIP-1967 implementation slot minus 1, hashed

function decodeAddress(raw: string): string | null {
  if (!raw || raw === '0x') return null;
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (hex.length !== 64) return null;
  const addr = '0x' + hex.slice(24);
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  return addr;
}

task('zarp:impl-slot', 'Read and report the ERC1967 implementation slot for a (canonical) proxy')
  .addOptionalParam('proxy', 'Proxy address override')
  .addFlag('json', 'Emit raw JSON (default)')
  .addFlag('pretty', 'Pretty-print human output')
  .setAction(async (args, hre) => {
    const { proxy: proxyOverride, json, pretty } = args;
    const { ethers, upgrades, network } = hre as typeof hre & { upgrades: any };

    // Resolve chainId and proxy
    let chainId = network.config.chainId as number | undefined;
    if (!chainId) {
      try {
        chainId = Number((await ethers.provider.getNetwork()).chainId.toString());
      } catch {}
    }
    if (chainId === undefined) throw new Error('Unable to resolve chainId');

    const recordPath = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
    let proxy: string | undefined;
    const forked = !!(network as any).config?.forking;
    const LOCAL_CANONICAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
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
      // Fallbacks for local development (chainId 31337 not in canonical map):
      if (!proxy && chainId === 31337) {
        // If forked, we want to inspect the global canonical proxy; else use the local deterministic address
        proxy = forked ? CANONICAL_PROXY_ADDRESS : LOCAL_CANONICAL;
      }
    }
    if (!proxy) throw new Error('Unable to resolve proxy address (no override, no record, no canonical)');
    if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) throw new Error(`Invalid proxy address ${proxy}`);

    const code = await ethers.provider.getCode(proxy);
    if (!code || code === '0x') {
      const errMsg = `No contract code at proxy ${proxy}`;
      const suggestion =
        chainId === 31337
          ? 'Deploy locally first: yarn hardhat deploy:roles --minter <addr> --verifier <addr> --burner <addr> --pauser <addr> --upgrader <addr>'
          : 'Ensure the canonical proxy is deployed on this network or provide --proxy override';
      if (json || !pretty) {
        console.log(JSON.stringify({ network: network.name, chainId, proxy, error: errMsg, suggestion }));
        return;
      }
      throw new Error(`${errMsg}. ${suggestion}`);
    }

    const raw = await ethers.provider.getStorage(proxy, IMPLEMENTATION_SLOT);
    const decoded = decodeAddress(raw);
    const viaPlugin = await upgrades.erc1967.getImplementationAddress(proxy);
    const match = decoded && decoded.toLowerCase() === viaPlugin.toLowerCase();

    const result = { network: network.name, chainId, proxy, slot: IMPLEMENTATION_SLOT, raw, decoded, viaPlugin, match };

    if (json || !pretty) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`Network: ${network.name} (chainId ${chainId})`);
      console.log(`Proxy:   ${proxy}`);
      console.log(`Slot:    ${IMPLEMENTATION_SLOT}`);
      console.log(`Raw:     ${raw}`);
      console.log(`Decoded: ${decoded}`);
      console.log(`Plugin:  ${viaPlugin}`);
      console.log(`Match:   ${match}`);
    }
  });
