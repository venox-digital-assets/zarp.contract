import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { Zarp as ZarpType } from '../typechain-types';
import { deployProxyFromFactoryTyped } from './helpers';
import { ROLE_NAMES, censusRoles, executeRoleTransfer, planRoleTransfer } from '../tasks/roleLib';

const A = '0xAAaAaAAAAaaAAaaAaaaAAAAAaaAAAaAAaAAAAAaA';
const B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const C = '0xCcCCCcccCCCCcCCCCCCcCcCccCcCCCcCcccccccC';

/*
 * Handing over an AccessControl deployment is order-sensitive and irreversible.
 * revokeRole() requires the caller to still hold the role's admin, so dropping
 * DEFAULT_ADMIN_ROLE early strands every remaining role. These tests pin the
 * ordering and the guards that stop a plan from bricking the contract.
 */
describe('roleLib.planRoleTransfer', function () {
  const allHeldBy = (addr: string) =>
    Object.fromEntries(ROLE_NAMES.map(r => [r, [addr]])) as Record<(typeof ROLE_NAMES)[number], string[]>;

  it('grants every held role to the new holder before revoking anything', function () {
    const plan = planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: B, signer: A });

    const firstRevoke = plan.steps.findIndex(s => s.action !== 'grantRole');
    const lastGrant = plan.steps.map(s => s.action).lastIndexOf('grantRole');
    expect(lastGrant).to.be.lessThan(firstRevoke);
    expect(plan.steps.filter(s => s.action === 'grantRole').map(s => s.role)).to.have.members([...ROLE_NAMES]);
  });

  it('removes DEFAULT_ADMIN_ROLE from the old holder as the very last step', function () {
    const plan = planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: B, signer: A });

    const last = plan.steps[plan.steps.length - 1];
    expect(last.role).to.equal('DEFAULT_ADMIN_ROLE');
    expect(last.action).to.be.oneOf(['revokeRole', 'renounceRole']);
    expect(last.account).to.equal(A);
  });

  it('uses renounceRole when the signer is removing itself', function () {
    const plan = planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: B, signer: A });
    const removals = plan.steps.filter(s => s.action !== 'grantRole');
    expect(removals).to.have.lengthOf(ROLE_NAMES.length);
    for (const step of removals) expect(step.action, `${step.role}`).to.equal('renounceRole');
  });

  it('uses revokeRole when the signer is removing a third party', function () {
    const plan = planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: B, signer: C });
    const removals = plan.steps.filter(s => s.action !== 'grantRole');
    for (const step of removals) expect(step.action, `${step.role}`).to.equal('revokeRole');
  });

  it('skips granting a role the new holder already has', function () {
    const holders = allHeldBy(A);
    holders.MINTER_ROLE = [A, B];
    const plan = planRoleTransfer({ currentHolders: holders, from: A, to: B, signer: A });

    expect(plan.steps.filter(s => s.action === 'grantRole' && s.role === 'MINTER_ROLE')).to.be.empty;
    // still revoked from the old holder
    expect(plan.steps.filter(s => s.action === 'renounceRole' && s.role === 'MINTER_ROLE')).to.have.lengthOf(1);
  });

  it('skips revoking a role the old holder does not hold', function () {
    const holders = allHeldBy(A);
    holders.PAUSER_ROLE = [];
    const plan = planRoleTransfer({ currentHolders: holders, from: A, to: B, signer: A });

    expect(plan.steps.filter(s => s.role === 'PAUSER_ROLE')).to.be.empty;
  });

  it('restricts the plan to an explicit role subset when given', function () {
    const plan = planRoleTransfer({
      currentHolders: allHeldBy(A),
      from: A,
      to: B,
      signer: A,
      roles: ['MINTER_ROLE', 'BURNER_ROLE'],
    });

    expect(new Set(plan.steps.map(s => s.role))).to.deep.equal(new Set(['MINTER_ROLE', 'BURNER_ROLE']));
  });

  it('refuses a plan that would leave nobody holding DEFAULT_ADMIN_ROLE', function () {
    expect(() =>
      planRoleTransfer({
        currentHolders: allHeldBy(A),
        from: A,
        to: B,
        signer: A,
        roles: ['DEFAULT_ADMIN_ROLE'],
        grant: false,
      }),
    ).to.throw(/DEFAULT_ADMIN_ROLE/i);
  });

  it('allows dropping admin from the old holder when another admin already exists', function () {
    const holders = allHeldBy(A);
    holders.DEFAULT_ADMIN_ROLE = [A, C];
    const plan = planRoleTransfer({ currentHolders: holders, from: A, to: B, signer: A, roles: ['DEFAULT_ADMIN_ROLE'], grant: false });

    expect(plan.steps).to.have.lengthOf(1);
    expect(plan.steps[0]).to.include({ role: 'DEFAULT_ADMIN_ROLE', action: 'renounceRole', account: A });
  });

  it('rejects a transfer to the zero address', function () {
    expect(() => planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: ethers.ZeroAddress, signer: A })).to.throw(
      /zero address/i,
    );
  });

  it('rejects a transfer where source and destination are the same account', function () {
    expect(() => planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: A.toLowerCase(), signer: A })).to.throw(/same/i);
  });

  it('rejects a malformed destination address', function () {
    expect(() => planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: '0xnope', signer: A })).to.throw(/invalid/i);
  });

  it('warns when the destination has no contract code (likely not a Safe)', function () {
    const plan = planRoleTransfer({ currentHolders: allHeldBy(A), from: A, to: B, signer: A, toHasCode: false });
    expect(plan.warnings.join(' ')).to.match(/no (contract )?code/i);
  });
});

describe('roleLib.executeRoleTransfer', function () {
  async function deployFixture() {
    const [deployer, safe, other] = await ethers.getSigners();
    const Zarp = await ethers.getContractFactory('Zarp');
    const zarp = await deployProxyFromFactoryTyped<ZarpType>(Zarp);
    await zarp.waitForDeployment();
    return { zarp, deployer, safe, other };
  }

  it('changes nothing when executed as a dry run', async function () {
    const { zarp, deployer, safe } = await loadFixture(deployFixture);
    const plan = planRoleTransfer({
      currentHolders: (await censusRoles(zarp as any, ethers.provider, { proxy: await zarp.getAddress(), fromBlock: 0 })).currentHolders,
      from: deployer.address,
      to: safe.address,
      signer: deployer.address,
    });

    const result = await executeRoleTransfer(zarp as any, plan, { execute: false });

    expect(result.executed).to.be.false;
    for (const role of ROLE_NAMES) {
      expect(await zarp.hasRole(await roleHash(zarp, role), safe.address), `${role} on safe`).to.be.false;
      expect(await zarp.hasRole(await roleHash(zarp, role), deployer.address), `${role} on deployer`).to.be.true;
    }
  });

  it('moves every role to the new holder and leaves the old holder with none', async function () {
    const { zarp, deployer, safe } = await loadFixture(deployFixture);
    const proxy = await zarp.getAddress();
    const before = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    const plan = planRoleTransfer({ currentHolders: before.currentHolders, from: deployer.address, to: safe.address, signer: deployer.address });

    const result = await executeRoleTransfer(zarp as any, plan, { execute: true });
    expect(result.executed).to.be.true;
    expect(result.receipts).to.have.lengthOf(plan.steps.length);

    const after = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    for (const role of ROLE_NAMES) {
      expect(after.currentHolders[role], `${role}`).to.deep.equal([safe.address]);
    }
  });

  it('leaves the new holder able to administer roles afterwards', async function () {
    const { zarp, deployer, safe, other } = await loadFixture(deployFixture);
    const proxy = await zarp.getAddress();
    const before = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    const plan = planRoleTransfer({ currentHolders: before.currentHolders, from: deployer.address, to: safe.address, signer: deployer.address });
    await executeRoleTransfer(zarp as any, plan, { execute: true });

    // the new admin can still hand MINTER_ROLE onward (e.g. to a yield contract)
    await expect(zarp.connect(safe).grantRole(await zarp.MINTER_ROLE(), other.address)).to.not.be.reverted;
    // and the old holder can no longer grant anything
    await expect(zarp.connect(deployer).grantRole(await zarp.MINTER_ROLE(), other.address)).to.be.reverted;
  });

  it('is idempotent: re-running against the finished state produces an empty plan', async function () {
    const { zarp, deployer, safe } = await loadFixture(deployFixture);
    const proxy = await zarp.getAddress();
    const before = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    await executeRoleTransfer(
      zarp as any,
      planRoleTransfer({ currentHolders: before.currentHolders, from: deployer.address, to: safe.address, signer: deployer.address }),
      { execute: true },
    );

    const after = await censusRoles(zarp as any, ethers.provider, { proxy, fromBlock: 0 });
    const rerun = planRoleTransfer({ currentHolders: after.currentHolders, from: deployer.address, to: safe.address, signer: deployer.address });

    expect(rerun.steps).to.be.empty;
  });
});

async function roleHash(zarp: any, role: string): Promise<string> {
  return role === 'DEFAULT_ADMIN_ROLE' ? ethers.ZeroHash : await zarp[role]();
}
