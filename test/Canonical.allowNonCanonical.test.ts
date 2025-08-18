import { expect } from 'chai';
import hre from 'hardhat';
import { deployAndConfigure, CANONICAL_PROXY_LOCAL } from '../scripts/lib/deployShared';

// Strategy: deploy a throwaway contract first so that the next proxy deployment (implementation + proxy) path
// yields a different proxy address than the canonical. We expect a failure without allowNonCanonical and a warning + success with it.

describe('Local allowNonCanonical flag', () => {
  beforeEach(async () => {
    // Ensure clean deterministic nonce path for each test run
    await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
  });
  async function deployThrowaway() {
    // Deploy a fresh implementation of Zarp (non-proxy) to advance nonce
    const Impl = await hre.ethers.getContractFactory('Zarp');
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
  }

  it('rejects non-canonical without flag, then allows with flag', async () => {
    // First deploy canonical (snapshot not used to ensure nonce advances)
    await deployAndConfigure(hre as any, {}, { summary: false });

    // Deploy throwaway to disturb nonce path (force next proxy off canonical)
    await deployThrowaway();

    // Attempt second deployment (should mismatch and throw)
    try {
      await deployAndConfigure(hre as any, {}, { summary: false });
      expect.fail('Expected mismatch without allowNonCanonical');
    } catch (e: any) {
      // Match the distinctive leading phrase from current deployShared error.
      expect(String(e.message || e)).to.match(/Local single-proxy invariant violated/i);
    }

    // Now allow non-canonical
    const res = await deployAndConfigure(hre as any, {}, { summary: false, allowNonCanonical: true });
    expect(res.proxyAddress.toLowerCase()).to.not.equal(CANONICAL_PROXY_LOCAL.toLowerCase());
  });
});
