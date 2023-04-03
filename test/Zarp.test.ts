import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

describe('Zarp', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployZarpFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, minter, pauser, upgrader, verifier, burner, random, verified] = await ethers.getSigners();

    const Zarp = await ethers.getContractFactory('Zarp');
    // const zarp = await Zarp.deploy();
    const zarp = await upgrades.deployProxy(Zarp);

    await zarp.deployed();
    await zarp.grantRole(await zarp.MINTER_ROLE(), minter.address);
    await zarp.grantRole(await zarp.PAUSER_ROLE(), pauser.address);
    await zarp.grantRole(await zarp.UPGRADER_ROLE(), upgrader.address);
    await zarp.grantRole(await zarp.VERIFIER_ROLE(), verifier.address);
    await zarp.grantRole(await zarp.BURNER_ROLE(), burner.address);

    const asVerifier = zarp.connect(verifier);
    await asVerifier.verify(verified.address);

    return {
      zarp,
      owner,
      minter,
      pauser,
      upgrader,
      verifier,
      burner,
      random,
      verified,
    };
  }

  describe('Deployment', function () {
    it('Should setup token correctly', async function () {
      const { zarp } = await loadFixture(deployZarpFixture);

      expect(await zarp.name()).to.equal('ZARP Stablecoin');
      expect(await zarp.decimals()).to.equal(18);
      expect(await zarp.symbol()).to.equal('ZARP');
    });
    it('Should assign minter role', async function () {
      const { zarp, minter } = await loadFixture(deployZarpFixture);
      expect(await zarp.hasRole(await zarp.MINTER_ROLE(), minter.address)).to.equal(true);
    });
    it('Should assign pauser role', async function () {
      const { zarp, pauser } = await loadFixture(deployZarpFixture);
      expect(await zarp.hasRole(await zarp.PAUSER_ROLE(), pauser.address)).to.equal(true);
    });
    it('Should assign upgrader role', async function () {
      const { zarp, upgrader } = await loadFixture(deployZarpFixture);
      expect(await zarp.hasRole(await zarp.UPGRADER_ROLE(), upgrader.address)).to.equal(true);
    });
    it('Should assign verifier role', async function () {
      const { zarp, verifier } = await loadFixture(deployZarpFixture);
      expect(await zarp.hasRole(await zarp.VERIFIER_ROLE(), verifier.address)).to.equal(true);
    });
    it('Should assign burner role', async function () {
      const { zarp, burner } = await loadFixture(deployZarpFixture);
      expect(await zarp.hasRole(await zarp.BURNER_ROLE(), burner.address)).to.equal(true);
    });
  });

  describe('Verifing & Minting', function () {
    it('Should verify account and return isVerified as verifier', async function () {
      const { zarp, verifier, random } = await loadFixture(deployZarpFixture);
      const asVerifier = zarp.connect(verifier);
      expect(await zarp.isVerified(random.address)).to.equal(false);
      await asVerifier.verify(random.address);
      expect(await zarp.isVerified(random.address)).to.equal(true);
    });
    it('Should fail to verify as random', async function () {
      const { zarp, random } = await loadFixture(deployZarpFixture);
      const asRandom = zarp.connect(random);
      await expect(asRandom.verify(random.address)).to.be.reverted;
      expect(await zarp.isVerified(random.address)).to.equal(false);
    });
    it('Should fail minting to unverified account as minter', async function () {
      const { zarp, minter, random } = await loadFixture(deployZarpFixture);
      const asMinter = zarp.connect(minter);
      expect(await zarp.isVerified(random.address)).to.equal(false);
      await expect(asMinter.mint(random.address, 1000)).to.be.reverted;
    });
    it('Should mint to verified account as minter', async function () {
      const { zarp, verifier, minter, random } = await loadFixture(deployZarpFixture);
      const asVerifier = zarp.connect(verifier);
      await asVerifier.verify(random.address);
      const asMinter = zarp.connect(minter);
      await asMinter.mint(random.address, 1000);
      expect(await zarp.totalSupply()).to.equal(1000);
      expect(await zarp.balanceOf(random.address)).to.equal(1000);
    });
    it('Should appropriately increase totalSupply after minting', async () => {
      const { zarp, minter, verified } = await loadFixture(deployZarpFixture);
      const asMinter = zarp.connect(minter);
      await asMinter.mint(verified.address, 1000);
      expect(await zarp.totalSupply()).to.equal(1000);
      await asMinter.mint(verified.address, 1000);
      expect(await zarp.totalSupply()).to.equal(2000);
    });
    it('Should emit event on verify', async () => {
      const { zarp, verifier, random } = await loadFixture(deployZarpFixture);
      const asVerifier = zarp.connect(verifier);

      await expect(asVerifier.verify(random.address))
        .to.emit(zarp, 'AddressVerificationChanged')
        .withArgs(random.address, verifier.address, true);
    });
    it('Should emit event on removeVerification', async () => {
      const { zarp, verifier, random } = await loadFixture(deployZarpFixture);
      const asVerifier = zarp.connect(verifier);

      await expect(asVerifier.removeVerification(random.address))
        .to.emit(zarp, 'AddressVerificationChanged')
        .withArgs(random.address, verifier.address, false);
    });
  });
  describe('Burning', function () {
    it('Should not allow burning without BURNER_ROLE role', async () => {
      const { zarp, minter, verified } = await loadFixture(deployZarpFixture);
      const asMinter = zarp.connect(minter);
      await asMinter.mint(verified.address, 1000);
      const asVerified = zarp.connect(verified);
      await expect(asVerified.burn(10)).to.be.reverted;
      expect(await zarp.balanceOf(verified.address)).to.equal(1000);
    });
    it('Should transfer to BURNER_ROLE as verified, and burn successfully', async () => {
      const { zarp, minter, verified, burner } = await loadFixture(deployZarpFixture);
      const asMinter = zarp.connect(minter);
      await asMinter.mint(verified.address, 1000);
      const asVerified = zarp.connect(verified);
      await asVerified.transfer(burner.address, 50);
      const asBurner = zarp.connect(burner);
      await asBurner.burn(30);
      expect(await zarp.balanceOf(verified.address)).to.equal(950);
      expect(await zarp.balanceOf(burner.address)).to.equal(20);
    });
  });
});
