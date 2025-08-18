import { expect } from 'chai';
import { ethers, upgrades, network } from 'hardhat';

/**
 * Fork Upgrade Test
 *
 * Purpose: Simulate upgrading the already-deployed mainnet (or other network) proxy
 * using a Hardhat fork. Requires env MAINNET_FORK_URL (and optional MAINNET_FORK_BLOCK)
 * and the known proxy + upgrader (or admin) address passed in via env/cli.
 *
 * Run:
 *   MAINNET_FORK_URL=https://eth-mainnet.alchemyapi.io/v2/KEY \
 *   PROXY_ADDR=0xProxyAddress \
 *   UPGRADER_ADDR=0xUpgraderHoldingRole \
 *   yarn hardhat test test/Zarp.fork-upgrade.test.ts
 */

describe('Fork Upgrade Simulation', function () {
  const proxy = process.env.PROXY_ADDR;
  const upgraderAddr = process.env.UPGRADER_ADDR;

  if (!process.env.MAINNET_FORK_URL) {
    console.warn('Skipping (no MAINNET_FORK_URL set)');
    return; // Skip entire suite if not forking
  }
  if (!proxy || !upgraderAddr) {
    console.warn('Skipping (PROXY_ADDR or UPGRADER_ADDR not set)');
    return;
  }

  it('performs upgrade on fork preserving state', async function () {
    // Impersonate upgrader
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [upgraderAddr],
    });
    const upgraderSigner = await ethers.getSigner(upgraderAddr);

    const ZarpCurrent = await ethers.getContractFactory('Zarp');
    const current = ZarpCurrent.attach(proxy) as any;

    const totalBefore = await current.totalSupply();

    // Prepare new implementation
    const ZarpV2 = await ethers.getContractFactory('ZarpV2');
    const upgraded = (await upgrades.upgradeProxy(proxy, ZarpV2.connect(upgraderSigner))) as any;
    await upgraded.waitForDeployment();

    expect(await upgraded.totalSupply()).to.equal(totalBefore);
    // New function available
    expect(await (upgraded as any).version()).to.equal('2');
  });
});
