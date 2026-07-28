import { ethers } from 'ethers';

/*
Shared role auditing / handover logic for the Zarp proxy.

Zarp inherits AccessControlUpgradeable, NOT AccessControlEnumerableUpgradeable,
so there is no on-chain list of role holders. The only complete way to answer
"who holds what" is to replay RoleGranted/RoleRevoked logs from the proxy's
creation block and re-confirm every candidate with hasRole().

Kept free of Hardhat Runtime Environment imports so it stays unit testable.
*/

export const ROLE_NAMES = ['DEFAULT_ADMIN_ROLE', 'MINTER_ROLE', 'PAUSER_ROLE', 'UPGRADER_ROLE', 'VERIFIER_ROLE', 'BURNER_ROLE'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export type RoleHolders = Record<RoleName, string[]>;

export interface RoleEvent {
  block: number;
  tx: string;
  event: 'RoleGranted' | 'RoleRevoked' | 'AddressVerificationChanged';
  role?: RoleName | string;
  account: string;
  sender: string;
  status?: boolean;
}

export interface RoleCensus {
  proxy: string;
  scannedFrom: number;
  scannedTo: number;
  roleHashes: Record<RoleName, string>;
  roleAdmins: Record<RoleName, string>;
  currentHolders: RoleHolders;
  verifiedAddresses: string[];
  upgrades: Array<{ block: number; tx: string; implementation: string }>;
  roleAdminChanges: Array<{ block: number; tx: string; role: string; previousAdminRole: string; newAdminRole: string }>;
  history: RoleEvent[];
}

export const ROLE_EVENT_ABI = [
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)',
  'event AddressVerificationChanged(address indexed account, address indexed sender, bool verificationStatus)',
  'event Upgraded(address indexed implementation)',
];

/** Default eth_getLogs window. Public RPCs (Alchemy et al) reject unbounded ranges. */
export const DEFAULT_CHUNK_SIZE = 400_000;

/**
 * Binary search for the first block at which `address` has contract code.
 * Throws if the address has no code at `head` (i.e. is not a contract).
 */
export async function findCreationBlock(provider: any, address: string, head: number): Promise<number> {
  if ((await provider.getCode(address, head)) === '0x') {
    throw new Error(`Address ${address} has no code at block ${head}; cannot locate a creation block`);
  }
  let lo = 0;
  let hi = head;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await provider.getCode(address, mid)) === '0x') lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Read every role's bytes32 identifier from the contract. */
export async function resolveRoleHashes(token: any): Promise<Record<RoleName, string>> {
  const out = {} as Record<RoleName, string>;
  for (const name of ROLE_NAMES) {
    out[name] = String(await token[name]());
  }
  return out;
}

/** Fetch the proxy's role/verification logs, chunked to respect RPC range limits. */
export async function scanRoleLogs(
  provider: any,
  proxy: string,
  opts: { fromBlock: number; toBlock: number; chunkSize?: number; onProgress?: (from: number, to: number, count: number) => void },
): Promise<any[]> {
  const iface = new ethers.Interface(ROLE_EVENT_ABI);
  const topics = [
    ['RoleGranted', 'RoleRevoked', 'RoleAdminChanged', 'AddressVerificationChanged', 'Upgraded'].map(n => iface.getEvent(n)!.topicHash),
  ];
  const chunk = Math.max(1, opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const logs: any[] = [];
  for (let start = opts.fromBlock; start <= opts.toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, opts.toBlock);
    const batch = await provider.getLogs({ address: proxy, fromBlock: start, toBlock: end, topics });
    logs.push(...batch);
    opts.onProgress?.(start, end, batch.length);
  }
  return logs;
}

/**
 * Full role census for a proxy: replay history, then confirm current state on chain.
 * `fromBlock` defaults to the proxy's creation block (binary searched).
 */
export async function censusRoles(
  token: any,
  provider: any,
  opts: {
    proxy: string;
    fromBlock?: number;
    toBlock?: number;
    chunkSize?: number;
    onProgress?: (from: number, to: number, count: number) => void;
  },
): Promise<RoleCensus> {
  const proxy = ethers.getAddress(opts.proxy);
  const head = opts.toBlock ?? (await provider.getBlockNumber());
  const from = opts.fromBlock ?? (await findCreationBlock(provider, proxy, head));

  const roleHashes = await resolveRoleHashes(token);
  const hashToName: Record<string, RoleName> = {};
  for (const [name, hash] of Object.entries(roleHashes)) hashToName[hash.toLowerCase()] = name as RoleName;

  const logs = await scanRoleLogs(provider, proxy, {
    fromBlock: from,
    toBlock: head,
    chunkSize: opts.chunkSize,
    onProgress: opts.onProgress,
  });
  const iface = new ethers.Interface(ROLE_EVENT_ABI);

  const history: RoleEvent[] = [];
  const candidates = new Map<RoleName, Set<string>>();
  const verifiedCandidates = new Set<string>();
  const upgrades: RoleCensus['upgrades'] = [];
  const roleAdminChanges: RoleCensus['roleAdminChanges'] = [];

  for (const log of logs) {
    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) continue;

    if (parsed.name === 'RoleGranted' || parsed.name === 'RoleRevoked') {
      const roleName = hashToName[String(parsed.args.role).toLowerCase()] ?? String(parsed.args.role);
      const account = ethers.getAddress(parsed.args.account);
      history.push({
        block: log.blockNumber,
        tx: log.transactionHash,
        event: parsed.name,
        role: roleName,
        account,
        sender: ethers.getAddress(parsed.args.sender),
      });
      if (hashToName[String(parsed.args.role).toLowerCase()]) {
        const key = roleName as RoleName;
        if (!candidates.has(key)) candidates.set(key, new Set());
        candidates.get(key)!.add(account);
      }
    } else if (parsed.name === 'AddressVerificationChanged') {
      const account = ethers.getAddress(parsed.args.account);
      verifiedCandidates.add(account);
      history.push({
        block: log.blockNumber,
        tx: log.transactionHash,
        event: 'AddressVerificationChanged',
        account,
        sender: ethers.getAddress(parsed.args.sender),
        status: Boolean(parsed.args.verificationStatus),
      });
    } else if (parsed.name === 'Upgraded') {
      upgrades.push({ block: log.blockNumber, tx: log.transactionHash, implementation: ethers.getAddress(parsed.args.implementation) });
    } else if (parsed.name === 'RoleAdminChanged') {
      roleAdminChanges.push({
        block: log.blockNumber,
        tx: log.transactionHash,
        role: hashToName[String(parsed.args.role).toLowerCase()] ?? String(parsed.args.role),
        previousAdminRole: String(parsed.args.previousAdminRole),
        newAdminRole: String(parsed.args.newAdminRole),
      });
    }
  }

  // History tells us who to ask about; the chain tells us who actually holds it.
  const currentHolders = {} as RoleHolders;
  for (const role of ROLE_NAMES) {
    const held: string[] = [];
    for (const account of candidates.get(role) ?? []) {
      if (await token.hasRole(roleHashes[role], account)) held.push(account);
    }
    currentHolders[role] = held;
  }

  const verifiedAddresses: string[] = [];
  for (const account of verifiedCandidates) {
    if (await token.isVerified(account)) verifiedAddresses.push(account);
  }

  const roleAdmins = {} as Record<RoleName, string>;
  for (const role of ROLE_NAMES) {
    const admin = String(await token.getRoleAdmin(roleHashes[role]));
    roleAdmins[role] = hashToName[admin.toLowerCase()] ?? admin;
  }

  return {
    proxy,
    scannedFrom: from,
    scannedTo: head,
    roleHashes,
    roleAdmins,
    currentHolders,
    verifiedAddresses,
    upgrades,
    roleAdminChanges,
    history,
  };
}

export interface RoleTransferStep {
  action: 'grantRole' | 'revokeRole' | 'renounceRole';
  role: RoleName;
  account: string;
  roleHash?: string;
}

export interface RoleTransferPlan {
  from: string;
  to: string;
  signer: string;
  steps: RoleTransferStep[];
  warnings: string[];
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Build an ordered, guarded plan to move roles from one holder to another.
 *
 * Ordering is not cosmetic. OZ revokeRole() requires the caller to still hold
 * the role's admin, so DEFAULT_ADMIN_ROLE must be surrendered last or every
 * remaining role is stranded. Grants therefore precede all removals, and the
 * admin removal is always the final step.
 */
export function planRoleTransfer(input: {
  currentHolders: RoleHolders;
  from: string;
  to: string;
  signer: string;
  roles?: readonly RoleName[];
  grant?: boolean;
  revoke?: boolean;
  toHasCode?: boolean;
  roleHashes?: Record<RoleName, string>;
}): RoleTransferPlan {
  const { currentHolders, roles = ROLE_NAMES, grant = true, revoke = true, toHasCode, roleHashes } = input;

  for (const [label, value] of [
    ['from', input.from],
    ['to', input.to],
  ] as const) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid --${label} address: ${value}`);
  }
  if (input.to === ethers.ZeroAddress) throw new Error('Refusing to transfer roles to the zero address');
  if (sameAddress(input.from, input.to)) throw new Error('Source and destination are the same account; nothing to transfer');

  const from = ethers.getAddress(input.from);
  const to = ethers.getAddress(input.to);
  const signer = ethers.getAddress(input.signer);

  const holds = (role: RoleName, account: string) => (currentHolders[role] ?? []).some(h => sameAddress(h, account));

  const grants: RoleTransferStep[] = [];
  const removals: RoleTransferStep[] = [];
  const warnings: string[] = [];

  for (const role of roles) {
    // A transfer moves authority; it must never create it. If `from` does not
    // hold the role there is nothing to transfer, so `to` does not receive it.
    const transferable = holds(role, from);
    const willGrant = grant && transferable && !holds(role, to);
    const willRemove = revoke && transferable;

    if (willGrant) grants.push({ action: 'grantRole', role, account: to, roleHash: roleHashes?.[role] });
    if (willRemove) {
      removals.push({
        action: sameAddress(from, signer) ? 'renounceRole' : 'revokeRole',
        role,
        account: from,
        roleHash: roleHashes?.[role],
      });
    }
  }

  // Guard: never leave the contract with no administrator.
  const removesAdmin = removals.some(s => s.role === 'DEFAULT_ADMIN_ROLE');
  if (removesAdmin) {
    const grantsAdmin = grants.some(s => s.role === 'DEFAULT_ADMIN_ROLE');
    const otherAdmins = (currentHolders.DEFAULT_ADMIN_ROLE ?? []).filter(h => !sameAddress(h, from));
    const destinationKeepsAdmin = grantsAdmin || holds('DEFAULT_ADMIN_ROLE', to);
    if (!destinationKeepsAdmin && otherAdmins.length === 0) {
      throw new Error(
        `Refusing to remove DEFAULT_ADMIN_ROLE from ${from}: no other account would hold it and the contract would become permanently unadministrable`,
      );
    }
  }

  if (toHasCode === false) {
    warnings.push(`Destination ${to} has no contract code; it is an EOA, not a Safe. Confirm this is intended.`);
  }

  // DEFAULT_ADMIN_ROLE is surrendered last so earlier revokes still authorise.
  removals.sort((a, b) => Number(a.role === 'DEFAULT_ADMIN_ROLE') - Number(b.role === 'DEFAULT_ADMIN_ROLE'));

  return { from, to, signer, steps: [...grants, ...removals], warnings };
}

export interface RoleTransferResult {
  executed: boolean;
  steps: RoleTransferStep[];
  receipts: Array<{ step: RoleTransferStep; txHash: string; blockNumber: number }>;
}

/**
 * Apply a plan. Defaults to a dry run: nothing is sent unless `execute` is true.
 */
export async function executeRoleTransfer(
  token: any,
  plan: RoleTransferPlan,
  opts: { execute?: boolean; onStep?: (step: RoleTransferStep, index: number, txHash?: string) => void } = {},
): Promise<RoleTransferResult> {
  const execute = opts.execute === true;
  const receipts: RoleTransferResult['receipts'] = [];
  if (!execute) {
    plan.steps.forEach((step, i) => opts.onStep?.(step, i));
    return { executed: false, steps: plan.steps, receipts };
  }

  const hashes = await resolveRoleHashes(token);
  for (const [i, step] of plan.steps.entries()) {
    const roleHash = step.roleHash ?? hashes[step.role];
    const tx = await token[step.action](roleHash, step.account);
    const receipt = await tx.wait();
    receipts.push({ step, txHash: receipt?.hash ?? tx.hash, blockNumber: receipt?.blockNumber ?? 0 });
    opts.onStep?.(step, i, receipt?.hash ?? tx.hash);
  }
  return { executed: true, steps: plan.steps, receipts };
}
