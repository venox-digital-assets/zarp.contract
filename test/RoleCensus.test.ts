import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { Zarp as ZarpType } from '../typechain-types';
import { deployProxyFromFactoryTyped } from './helpers';
import { ROLE_NAMES, censusRoles, findCreationBlock, resolveRoleHashes } from '../tasks/roleLib';

/*
 * Zarp inherits AccessControlUpgradeable (NOT the Enumerable variant), so role
 * holders cannot be read from chain state. The census replays RoleGranted /
 * RoleRevoked logs and re-confirms every candidate with hasRole(). These tests
 * pin that behaviour: it must find holders the deployment record never mentions,
 * and it must not report holders whose role was later revoked.
 */
describe('roleLib.censusRoles', function () {
  async function deployFixture() {
    const [deployer, minter, pauser, extraMinter, revoked, verified] = await ethers.getSigners();
    const Zarp = await ethers.getContractFactory('Zarp');
    const zarp = await deployProxyFromFactoryTyped<ZarpType>(Zarp);
    await zarp.waitForDeployment();
    return { zarp, deployer, minter, pauser, extraMinter, revoked, verified };
  }

  it('reports the deployer holding every role on a fresh proxy', async function () {
    const { zarp, deployer } = await loadFixture(deployFixture);
    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    for (const role of ROLE_NAMES) {
      expect(census.currentHolders[role], `${role} holders`).to.deep.equal([deployer.address]);
    }
  });

  it('finds holders that exist only in event history, not in any deployment record', async function () {
    const { zarp, minter, pauser, extraMinter } = await loadFixture(deployFixture);
    await zarp.grantRole(await zarp.MINTER_ROLE(), minter.address);
    await zarp.grantRole(await zarp.MINTER_ROLE(), extraMinter.address);
    await zarp.grantRole(await zarp.PAUSER_ROLE(), pauser.address);

    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    expect(census.currentHolders.MINTER_ROLE).to.include.members([minter.address, extraMinter.address]);
    expect(census.currentHolders.MINTER_ROLE).to.have.lengthOf(3); // deployer + 2
    expect(census.currentHolders.PAUSER_ROLE).to.include(pauser.address);
    expect(census.currentHolders.PAUSER_ROLE).to.not.include(minter.address);
  });

  it('excludes addresses whose role was granted then revoked', async function () {
    const { zarp, revoked } = await loadFixture(deployFixture);
    const BURNER = await zarp.BURNER_ROLE();
    await zarp.grantRole(BURNER, revoked.address);
    await zarp.revokeRole(BURNER, revoked.address);

    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    expect(census.currentHolders.BURNER_ROLE).to.not.include(revoked.address);
    // but the grant + revoke must still be visible in the audit trail
    const trail = census.history.filter(h => h.account === revoked.address);
    expect(trail.map(h => h.event)).to.deep.equal(['RoleGranted', 'RoleRevoked']);
  });

  it('reflects a renounced role as no longer held', async function () {
    const { zarp, deployer } = await loadFixture(deployFixture);
    await zarp.renounceRole(await zarp.PAUSER_ROLE(), deployer.address);

    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    expect(census.currentHolders.PAUSER_ROLE).to.be.empty;
    expect(census.currentHolders.MINTER_ROLE).to.deep.equal([deployer.address]);
  });

  it('records the role admin for every role', async function () {
    const { zarp } = await loadFixture(deployFixture);
    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    for (const role of ROLE_NAMES) {
      expect(census.roleAdmins[role], `${role} admin`).to.equal('DEFAULT_ADMIN_ROLE');
    }
  });

  it('collects currently-verified addresses from AddressVerificationChanged', async function () {
    const { zarp, verified, revoked } = await loadFixture(deployFixture);
    await zarp.verify(verified.address);
    await zarp.verify(revoked.address);
    await zarp.removeVerification(revoked.address);

    const census = await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 });

    expect(census.verifiedAddresses).to.include(verified.address);
    expect(census.verifiedAddresses).to.not.include(revoked.address);
  });

  it('honours a chunked scan and returns the same result as a single-range scan', async function () {
    const { zarp, minter } = await loadFixture(deployFixture);
    await zarp.grantRole(await zarp.MINTER_ROLE(), minter.address);
    const proxy = await zarp.getAddress();

    const single = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    const chunked = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0, chunkSize: 1 });

    expect(chunked.currentHolders).to.deep.equal(single.currentHolders);
    expect(chunked.history.length).to.equal(single.history.length);
  });

  it('resolves role name -> hash consistently with the contract', async function () {
    const { zarp } = await loadFixture(deployFixture);
    const hashes = await resolveRoleHashes(zarp as any);

    expect(hashes.DEFAULT_ADMIN_ROLE).to.equal(ethers.ZeroHash);
    expect(hashes.MINTER_ROLE).to.equal(await zarp.MINTER_ROLE());
    expect(hashes.BURNER_ROLE).to.equal(await zarp.BURNER_ROLE());
  });

  it('finds the creation block of the proxy by binary search', async function () {
    const { zarp } = await loadFixture(deployFixture);
    const proxy = await zarp.getAddress();
    const head = await ethers.provider.getBlockNumber();

    const created = await findCreationBlock(ethers.provider, proxy, head);

    expect(await ethers.provider.getCode(proxy, created)).to.not.equal('0x');
    expect(await ethers.provider.getCode(proxy, created - 1)).to.equal('0x');
  });

  it('throws a clear error when the address has no code', async function () {
    const head = await ethers.provider.getBlockNumber();
    await expect(findCreationBlock(ethers.provider, ethers.Wallet.createRandom().address, head)).to.be.rejectedWith(/no code/i);
  });
});
