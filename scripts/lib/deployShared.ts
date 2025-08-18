import { ContractTransactionResponse } from 'ethers';
import type { Zarp as ZarpType } from '../../typechain-types/contracts/Zarp';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

// Canonical proxy addresses (exported for test & task reuse)
export const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
export const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

export interface RoleTargets {
  admin?: string;
  minter?: string;
  pauser?: string;
  upgrader?: string;
  verifier?: string;
  burner?: string;
}

export interface DeployOptions {
  renounceAll?: boolean;
  renounceAdminOnly?: boolean;
  grant?: boolean; // default true
  log?: (...args: any[]) => void;
  summary?: boolean; // default true
  allowNonCanonical?: boolean; // only for local networks
}

export interface DeployResult {
  proxyAddress: string;
  implementationAddress: string;
  token: ZarpType;
  deployer: string;
  roles: { [k: string]: string };
}

export async function deployAndConfigure(
  hre: HardhatRuntimeEnvironment,
  targets: RoleTargets,
  opts: DeployOptions = {},
): Promise<DeployResult> {
  const { ethers, upgrades } = hre as typeof hre & { upgrades: any };
  const log = opts.log || console.log;
  const [deployerSigner] = await ethers.getSigners();
  const deployer = await deployerSigner.getAddress();

  // Canonical proxy address invariant (network-specific)
  const isLocal = hre.network.name === 'hardhat' || hre.network.name === 'localhost';
  const expectedCanonical = isLocal ? CANONICAL_PROXY_LOCAL : CANONICAL_PROXY_GLOBAL;
  if (!isLocal) {
    // Pre-check: if code already at canonical address AND we attempt another deploy, abort
    const existingCode = await ethers.provider.getCode(expectedCanonical);
    if (existingCode && existingCode !== '0x') {
      throw new Error(
        `Single-proxy invariant: canonical address ${expectedCanonical} on ${hre.network.name} already hosts a deployed ZARP proxy (code present). There must only ever be one proxy per network at its canonical address. Do NOT deploy again. Instead perform an upgrade using that existing proxy.

Next step: run an upgrade procedure (e.g. a Hardhat upgrade task/script) targeting ${expectedCanonical}.
If you expected to deploy fresh, verify you are on the intended network and that this address was not previously deployed (or reset your local chain if developing).`,
      );
    }
  }

  log('Deploying contracts with the account:', deployer);
  const balance = await ethers.provider.getBalance(deployer);
  log('Account balance:', ethers.formatEther(balance));

  const Factory = await ethers.getContractFactory('Zarp');
  const token = (await upgrades.deployProxy(Factory, [], { initializer: 'initialize' })) as unknown as ZarpType;
  await token.waitForDeployment();
  const proxyAddress = await token.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  if (proxyAddress.toLowerCase() !== expectedCanonical.toLowerCase()) {
    if (!opts.allowNonCanonical) {
      if (isLocal) {
        throw new Error(
          `Local single-proxy invariant violated: deployment yielded proxy ${proxyAddress} but required canonical local address is ${expectedCanonical}. Only one proxy (at the canonical address) should exist per network.

What this means: We intentionally fix the proxy address so tooling, integrations, and tests always reference a single stable location.
Typical causes: (a) different deployer nonce path than expected; (b) prior experimental deployment changed state; (c) you restarted using a cached chain state.
Recommended actions:
  1. If this is the FIRST intended deploy on a fresh localhost node, restart the node and try again.
  2. If a proxy already exists at ${expectedCanonical}, use an upgrade flow instead of redeploying.
  3. For experimentation only, you may retry with --allow-noncanonical (local only), but do NOT rely on that address long-term.
To proceed correctly, ensure the canonical address is used, then upgrade rather than redeploy when you need new logic.`,
        );
      }
      if (!opts.allowNonCanonical) {
        throw new Error(
          `Single-proxy invariant: deployment produced proxy ${proxyAddress} but required canonical address is ${expectedCanonical}. Only one proxy per network at its fixed canonical address.

Do NOT deploy a second proxy. Instead upgrade the existing canonical proxy at ${expectedCanonical}.
Checklist:
  - Confirm you are using the intended deployer (nonce sequence affects deterministic address).
  - Confirm no earlier deployment already established the canonical proxy (if so, upgrade it).
  - If this is a test and you need a clean slate, reset/replace the network state.
If you are on a local network and intentionally exploring alternate addresses, pass --allow-noncanonical (local only) — but avoid persisting or depending on that address beyond experimentation.`,
        );
      }
    } else if (!isLocal) {
      throw new Error('allowNonCanonical may only be used on local networks.');
    }
    if (opts.allowNonCanonical) {
      log(
        `[WARN] Non-canonical local deployment accepted (proxy ${proxyAddress} vs canonical ${expectedCanonical}). Avoid persisting this address; do not rely on it for tests beyond experimentation.`,
      );
    }
  }
  log('Token proxy address:', proxyAddress);
  log('Implementation address:', implementationAddress);
  log('Token symbol:', await token.symbol());
  log('Token name:', await token.name());
  log('Token total supply:', (await token.totalSupply()).toString());

  const roles = {
    DEFAULT_ADMIN_ROLE: await token.DEFAULT_ADMIN_ROLE(),
    MINTER_ROLE: await token.MINTER_ROLE(),
    PAUSER_ROLE: await token.PAUSER_ROLE(),
    UPGRADER_ROLE: await token.UPGRADER_ROLE(),
    VERIFIER_ROLE: await token.VERIFIER_ROLE(),
    BURNER_ROLE: await token.BURNER_ROLE(),
  };

  const grant = async (roleName: keyof typeof roles, addr?: string): Promise<ContractTransactionResponse | undefined> => {
    if (!addr || opts.grant === false) return;
    const role = roles[roleName];
    const has = await token.hasRole(role, addr);
    if (has) {
      log(`Role ${roleName} already granted to ${addr}`);
      return;
    }
    log(`Granting ${roleName} -> ${addr}`);
    const tx = await token.grantRole(role, addr);
    await tx.wait();
    return tx;
  };

  await grant('MINTER_ROLE', targets.minter);
  await grant('PAUSER_ROLE', targets.pauser);
  await grant('UPGRADER_ROLE', targets.upgrader);
  await grant('VERIFIER_ROLE', targets.verifier);
  await grant('BURNER_ROLE', targets.burner);
  await grant('DEFAULT_ADMIN_ROLE', targets.admin); // do last if moving admin away

  const renounceIf = async (roleName: keyof typeof roles, condition: boolean) => {
    if (!condition) return;
    const role = roles[roleName];
    const has = await token.hasRole(role, deployer);
    if (!has) return;
    log(`Renouncing ${roleName} from deployer`);
    const tx = await token.renounceRole(role, deployer);
    await tx.wait();
  };

  const newAdminProvided = !!targets.admin;

  if (opts.renounceAll) {
    await renounceIf('MINTER_ROLE', true);
    await renounceIf('PAUSER_ROLE', true);
    await renounceIf('UPGRADER_ROLE', true);
    await renounceIf('VERIFIER_ROLE', true);
    await renounceIf('BURNER_ROLE', true);
    await renounceIf('DEFAULT_ADMIN_ROLE', newAdminProvided);
  } else if (opts.renounceAdminOnly) {
    await renounceIf('DEFAULT_ADMIN_ROLE', newAdminProvided);
  }

  if (opts.summary !== false) {
    const addresses: string[] = [deployer];
    for (const v of Object.values(targets)) if (v) addresses.push(v);
    for (const [roleName, roleVal] of Object.entries(roles)) {
      log(`${roleName} holders:`);
      for (const addr of addresses) {
        const has = await token.hasRole(roleVal, addr);
        log(`  ${addr}: ${has}`);
      }
    }
  }

  return { proxyAddress, implementationAddress, token, deployer, roles };
}
