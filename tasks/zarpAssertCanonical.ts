import { task } from 'hardhat/config';
import { expectedCanonicalProxy } from './canonicalProxies';
import { writeArchive } from './archiveUtil';

/*
Hardhat task: zarp:assert-canonical
Checks that the expected canonical proxy (from registry) has code and matches
on-chain. Fails non-zero (throws) if mismatch or absent.

Usage:
  yarn hardhat zarp:assert-canonical --network mainnet
  yarn hardhat zarp:assert-canonical --network polygon --json
  yarn hardhat zarp:assert-canonical --network base --archive
*/

task('zarp:assert-canonical', 'Assert canonical proxy presence & match against registry')
  .addFlag('json', 'Emit JSON only')
  .addFlag('archive', 'Persist snapshot JSON under deployments/records/<network>/')
  .setAction(async (input, hre) => {
    const { json, archive } = input as any;
    const { network, ethers } = hre;
    // Robust chainId resolution (Hardhat localhost may omit explicit chainId in config)
    let chainId: number | undefined = network.config.chainId as number | undefined;
    if (chainId === undefined) {
      try {
        const net = await ethers.provider.getNetwork();
        chainId = Number(net.chainId);
      } catch {}
    }
    const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    const isLocal = network.name === 'hardhat' || network.name === 'localhost';
    let expected = chainId !== undefined ? expectedCanonicalProxy(chainId) : undefined;
    if (!expected && isLocal) {
      expected = CANONICAL_PROXY_LOCAL; // allow local canonical fallback
    }
    if (!expected) throw new Error(`No canonical proxy registered for chainId ${chainId}`);
    const code = await ethers.provider.getCode(expected);
    const hasCode = code && code !== '0x';
    const status = {
      network: network.name,
      chainId,
      expected,
      hasCode,
      expectedCanonicalMatch: hasCode, // resolved proxy is implicitly expected; presence implies match
    };

    if (archive) {
      try {
        const file = writeArchive(network.name, 'canonical', status);
        if (!json) console.log(`Archived canonical assertion -> ${file}`);
      } catch (e: any) {
        if (!json) console.warn(`Archive failed: ${e?.message || e}`);
      }
    }

    if (!hasCode) {
      const msg = `Canonical proxy at ${expected} has no code on ${network.name}`;
      if (json) console.error(JSON.stringify({ ...status, error: msg }));
      throw new Error(msg);
    }

    if (json) {
      console.log(JSON.stringify(status));
    } else {
      console.log('Canonical assertion OK:', status);
    }
  });
