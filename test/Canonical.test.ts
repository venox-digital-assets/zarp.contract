import { expect } from 'chai';
import hre from 'hardhat';
import { CANONICAL_PROXY_LOCAL, deployAndConfigure } from '../scripts/lib/deployShared';

// Focus: verify that the first local deployment hits the canonical address and a second
// attempt (without allowNonCanonical) is rejected.
describe('Canonical Proxy Address (Local)', () => {
  beforeEach(async () => {
    await (hre as any).network.provider.request({ method: 'hardhat_reset', params: [] });
  });
  it('first helper deployment produces the local canonical proxy address', async () => {
    const res = await deployAndConfigure(hre as any, {}, { summary: false });
    expect(res.proxyAddress.toLowerCase()).to.eq(CANONICAL_PROXY_LOCAL.toLowerCase());
  });

  it('second helper deployment attempt rejects with local canonical mismatch error', async () => {
    await deployAndConfigure(hre as any, {}, { summary: false });
    try {
      await deployAndConfigure(hre as any, {}, { summary: false });
      expect.fail('Expected second deployment to throw');
    } catch (e: any) {
      expect(String(e.message || e)).to.match(/canonical local/i);
    }
  });
});
