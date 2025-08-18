import { expect } from 'chai';
import hre from 'hardhat';
import { deployAndConfigure, CANONICAL_PROXY_GLOBAL } from '../scripts/lib/deployShared';

// Simulate non-local network by temporarily overriding hre.network.name.
// We expect a second deployment attempt (after first sets code) to throw the 'already has code' guard.

// NOTE: Skipped for now. The current deployment helper enforces a fixed
// canonical global proxy address, but without a deterministic deployment
// mechanism (e.g. CREATE2) in tests we cannot guarantee the proxy address
// will equal CANONICAL_PROXY_GLOBAL. Re-enable once deterministic mainnet
// address reproduction strategy is implemented.
describe.skip('Canonical Proxy Guard (Simulated Non-Local)', () => {
  const originalName = hre.network.name;
  before(() => {
    (hre.network as any).name = 'sepolia';
  });
  after(() => {
    (hre.network as any).name = originalName;
  });

  it('first deployment allowed (fresh canonical)', async () => {
    const res = await deployAndConfigure(hre as any, {}, { summary: false });
    expect(res.proxyAddress.toLowerCase()).to.equal(CANONICAL_PROXY_GLOBAL.toLowerCase());
  });

  it('second deployment blocked (already has code)', async () => {
    try {
      await deployAndConfigure(hre as any, {}, { summary: false });
      await deployAndConfigure(hre as any, {}, { summary: false });
      expect.fail('Expected second deploy to be blocked');
    } catch (e: any) {
      expect(String(e.message || e)).to.match(/already has code/i);
    }
  });
});
