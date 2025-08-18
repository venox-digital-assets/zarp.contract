import { task } from 'hardhat/config';
import fs from 'fs';
import { writeArchive } from './archiveUtil';
import path from 'path';

const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

task('zarp:canonical', 'Report canonical proxy status for current network')
  .addFlag('json', 'Emit JSON only')
  .addFlag('archive', 'Persist canonical status under deployments/records/<network>/')
  .setAction(async ({ json, archive }, hre) => {
    const { network, ethers } = hre;
    const isLocal = network.name === 'hardhat' || network.name === 'localhost';
    const expected = isLocal ? CANONICAL_PROXY_LOCAL : CANONICAL_PROXY_GLOBAL;
    let recordProxy: string | null = null;
    let recordPath: string | null = null;
    try {
      const file = path.join(process.cwd(), 'deployments', `${network.name}.zarp.json`);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.proxy && typeof data.proxy === 'string') {
          recordProxy = data.proxy;
          recordPath = file;
        }
      }
    } catch {}
    let onChainHasCode = false;
    try {
      const code = await ethers.provider.getCode(expected);
      onChainHasCode = !!code && code !== '0x';
    } catch {}
    const status = {
      network: network.name,
      expected,
      onChainHasCode,
      recordProxy,
      recordPath,
      recordMatchesExpected: recordProxy ? recordProxy.toLowerCase() === expected.toLowerCase() : null,
    };
    if (archive) {
      try {
        const file = writeArchive(network.name, 'canonical', status);
        if (!json) console.log(`Archived canonical status -> ${file}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }
    if (json) {
      console.log(JSON.stringify(status));
      return;
    }
    console.log('Canonical status:', status);
    if (!onChainHasCode) console.log('Note: No code currently at expected address.');
    if (recordProxy && recordProxy.toLowerCase() !== expected.toLowerCase()) {
      console.warn(`WARNING: Deployment record proxy ${recordProxy} != expected canonical ${expected}`);
    }
  });
