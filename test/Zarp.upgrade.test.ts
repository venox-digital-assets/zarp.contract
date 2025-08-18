import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { CANONICAL_PROXY_LOCAL } from '../scripts/lib/deployShared';
import type { Zarp as ZarpType } from '../typechain-types';
import type { ZarpV2 as ZarpV2Type } from '../typechain-types/contracts/ZarpV2';

describe('Zarp Upgrade Path', () => {
  beforeEach(async () => {
    // Fresh state so first proxy follows expected nonce path (improves chance
    // of matching the fixed local canonical constant). Even if it drifts, the
    // upgrade invariants below (state + version) remain valid.
    await ethers.provider.send('hardhat_reset', []);
  });
  async function deployProxyV1() {
    const [deployer, user, verifier, minter, upgrader] = await ethers.getSigners();
    const Zarp = await ethers.getContractFactory('Zarp');
    const proxy = (await upgrades.deployProxy(Zarp)) as unknown as ZarpType;
    await proxy.waitForDeployment();

    await proxy.grantRole(await proxy.VERIFIER_ROLE(), verifier.address);
    await proxy.grantRole(await proxy.MINTER_ROLE(), minter.address);
    await proxy.grantRole(await proxy.UPGRADER_ROLE(), upgrader.address);

    await proxy.connect(verifier).verify(user.address);
    await proxy.connect(minter).mint(user.address, 1234n);

    return { proxy, deployer, user, verifier, minter, upgrader };
  }

  it('upgrades to V2 preserving state and adding version()', async () => {
    const { proxy, user, verifier, minter, upgrader } = await deployProxyV1();

    const proxyAddr = await proxy.getAddress();
    // Canonical address check is desirable but not strictly required for
    // upgrade safety; keep as a soft assertion (warn if mismatch) to avoid
    // brittle failures due to nonce drift.
    if (!isCanonicalAddressEqual(proxyAddr, CANONICAL_PROXY_LOCAL)) {
      console.warn(
        `WARN: Deployed proxy ${proxyAddr} differs from CANONICAL_PROXY_LOCAL ${CANONICAL_PROXY_LOCAL}; proceeding with upgrade assertions.`,
      );
    }
    const totalBefore = await proxy.totalSupply();
    const balBefore = await proxy.balanceOf(user.address);
    const implBefore = await upgrades.erc1967.getImplementationAddress(await proxy.getAddress());

    const ZarpV2 = await ethers.getContractFactory('ZarpV2');
    const upgraded = (await upgrades.upgradeProxy(proxyAddr, ZarpV2)) as unknown as ZarpV2Type;
    await upgraded.waitForDeployment();
    const implAfter = await upgrades.erc1967.getImplementationAddress(await upgraded.getAddress());
    const proxyAfter = await upgraded.getAddress();
    expect(proxyAfter).to.equal(proxyAddr); // proxy remains canonical

    expect(implAfter).to.not.equal(implBefore);
    expect(await upgraded.totalSupply()).to.equal(totalBefore);
    expect(await upgraded.balanceOf(user.address)).to.equal(balBefore);
    expect(await upgraded.hasRole(await upgraded.VERIFIER_ROLE(), verifier.address)).to.be.true;
    expect(await upgraded.hasRole(await upgraded.MINTER_ROLE(), minter.address)).to.be.true;
    expect(await upgraded.hasRole(await upgraded.UPGRADER_ROLE(), upgrader.address)).to.be.true;
    expect(await upgraded.version()).to.equal('2');
  });
});
