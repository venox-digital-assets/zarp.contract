# ZARP Contribution Guide

This project comprises Ethereum smart contracts (Upgradeable ERC20 with role & verification gating) and a Solana SPL token. This guide covers environment setup, development workflow, deployment, upgrades, role governance, verification, and Solana module pointers.

## Table of Contents

- [ZARP Contribution Guide](#zarp-contribution-guide)
  - [Table of Contents](#table-of-contents)
  - [Principles](#principles)
  - [Setup](#setup)
  - [Common Tasks](#common-tasks)
    - [Build \& Test](#build--test)
    - [Local Deployment](#local-deployment)
    - [Testnet / Mainnet Deployment](#testnet--mainnet-deployment)
    - [Role Distribution on Deploy](#role-distribution-on-deploy)
    - [Inspection](#inspection)
    - [Upgrades](#upgrades)
    - [Implementation Verification](#implementation-verification)
    - [Archival Snapshots (--archive)](#archival-snapshots---archive)
    - [Canonical Address Assertion (CI)](#canonical-address-assertion-ci)
    - [Safe Role Renounce Sequence (Governance)](#safe-role-renounce-sequence-governance)
    - [Operational Tasks \& Examples](#operational-tasks--examples)
    - [Coding Standards](#coding-standards)
  - [Solana SPL Token Workflow](#solana-spl-token-workflow)
  - [Questions / Support](#questions--support)
    - [Mainnet Fork Simulation](#mainnet-fork-simulation)

## Principles

- Prefer well-audited libraries (OpenZeppelin).
- Keep upgradeable storage layout stable; add new vars only in gaps.
- Small, reviewable PRs with tests for new logic & upgrades.
- Document operational steps adjacent to scripts (self‑describing CLI help).
- Security first: principle of least privilege for roles; automate checks.

## Setup

1. Install dependencies (Yarn PnP):

   ```sh
   yarn install
   ```

2. Create `.env` (see `.env.example`). Minimum for Ethereum interaction:

   ```dotenv
   ALCHEMY_API_KEY=...
   DEPLOYER_PRIVATE_KEY=0x...
   MULTICHAIN_ETHERSCAN_API_KEY=... # unified explorer key (preferred)
   ```

3. Optional additional API keys (fallbacks if unified key not used): ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY, BASESCAN_API_KEY, GNOSISSCAN_API_KEY.

## Common Tasks

Fields (JSON):

- `network`, `chainId`
- `proxy`, `implementation`
- `expectedCanonical` (registry value for chain) and `expectedCanonicalMatch`
- `roles` (mapping role name -> array of holder addresses)
- `addresses` (optional per provided --address flags: balances, roles, verified status if --check-verified)
- `verified` (implementation + proxy explorer verification status if queried)
- `timestamp`
- `warnings` (array; populated for non-canonical, missing verification, etc.)

Flags:

- `--address <addr>` repeatable; inspect multiple addresses
- `--check-verified` queries explorer for implementation + proxy (may rate-limit)
- `--allow-noncanonical` only for local experimentation; suppresses mismatch failure
- `--json` machine-readable output
- `--archive` snapshot (label `status`)

### Build & Test

```sh
yarn hardhat compile
yarn hardhat test
```

### Local Deployment

Deploy a fresh proxy (canonical address invariant enforced) and optionally grant roles:

```sh
yarn hardhat deploy:roles --network localhost \
   --minter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --verifier 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --burner 0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
   --pauser 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
   --upgrader 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
```

#### Enumerate Local Signers (you will forget this in 6 months!)

When running against the in‑process Hardhat network (default) you can list the ephemeral accounts two ways:

1. Start a node (optional for simple scripts):

   ```sh
   yarn hardhat node
   ```

   The console output prints 20 funded accounts + private keys.

2. Or inside a console (no separate node needed):

   ```sh
   yarn hardhat console
   > (await ethers.getSigners()).map(s => s.address)
   ```

Copy the addresses you want to assign to roles. For local experimentation any of these is fine; in testnet/mainnet substitute multisig (Safe) / service addresses.

#### Deploy and Distribute Roles Immediately

Use the `deploy:roles` task to deploy and grant selected roles in one flow. Provide an address immediately after each role flag you want to grant.

```sh
yarn hardhat deploy:roles --network sepolia \
   --admin 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
   --minter 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB \
   --verifier 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC \
   --burner 0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD \
   --pauser 0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE \
   --upgrader 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF \
   --renounce
```

Key points:

- Omit any flag to skip granting that specific role (only the provided ones are granted).
- `--renounce` causes the deployer to renounce every role it granted away. Admin is retained unless you also pass `--admin` to hand off and then use `--renounce-admin` to drop admin from the deployer.
- `--renounce-admin` requires `--admin` (safety guard). It renounces `DEFAULT_ADMIN_ROLE` from the deployer after confirming a replacement admin was granted.
- To deploy without granting anything yet: add `--no-grant`.

After deployment, addresses and a status summary are printed; you can always run `zarp:status` (see below) to re‑introspect.

### Testnet / Mainnet Deployment

Add `--network sepolia` (or `gnosis`, `polygon`, `base`, etc):

```sh
yarn hardhat deploy:roles --network sepolia \
   --admin 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
   --minter 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB \
   --verifier 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC \
   --burner 0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD \
   --pauser 0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE \
   --upgrader 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF \
   --renounce-admin
```

After confidence on testnet, repeat for production with governance multisig addresses.

Sepolia readiness checklist:

- All tasks compile and tests pass (including `test/Zarp.upgrade.test.ts`).
- `zarp:status --check-verified` shows both proxy and implementation verified.
- `zarp:multi-audit` matches normalized runtime bytecode across supported networks.
- Governance/Safe addresses confirmed; renounce plan reviewed.
- Canonical assertion passes: `zarp:assert-canonical --network sepolia`.

### Role Distribution on Deploy

Roles (all initially granted to deployer in `initialize`):
`DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, `VERIFIER_ROLE`, `BURNER_ROLE`.

Recommended mapping (adjust to org context):

| Role               | Recommended Holder                         |
| ------------------ | ------------------------------------------ |
| DEFAULT_ADMIN_ROLE | Governance Safe (rare use)                 |
| UPGRADER_ROLE      | Governance / Tech Safe                     |
| MINTER_ROLE        | Operations Safe or service key with limits |
| PAUSER_ROLE        | Security / Emergency Safe                  |
| VERIFIER_ROLE      | Compliance service key / Safe              |
| BURNER_ROLE        | Controlled burn module / Safe              |

Use `deploy:roles` for grants on deploy; for post‑deploy adjustments prefer dedicated role tasks or direct contract calls via Safe.

### Inspection

Quickly introspect the canonical proxy and roles/balances:

```sh
yarn hardhat zarp:status --network sepolia --json
```

Include address snapshots and explorer status:

```sh
yarn hardhat zarp:status --network sepolia \
   --address 0xUserA \
   --address 0xSafeB \
   --check-verified --json
```

Smoke checks:

- End-to-end flow with `zarp:flow` on localhost or a throwaway fork to exercise verifier → verified mapping → mint → transfer → burn.

### Upgrades

1. Modify / add new implementation contract (e.g. `ZarpV2.sol`).

2. Run tests including upgrade path (add a fixture if needed).

3. Dry-run locally or on testnet using the task:

   ```sh
   yarn hardhat zarp:upgrade --network sepolia --impl ZarpV2
   ```

4. Verify new implementation (see below) then execute upgrade with an account holding `UPGRADER_ROLE` (ideally a Safe transaction).

### Implementation Verification

After deploying or upgrading, verify source on the explorer:

```sh
yarn hardhat zarp:verify --network sepolia
```

Options:

- `--onlyImplementation` verify just the implementation
- `--onlyProxy` verify just the proxy
- `--proxy <addr>` override proxy address (local only; defaults to canonical)

#### zarp:sign-message

Sign a message with a private key from environment (auto-loads `.env`). Useful for explorer ownership proofs.

```sh
yarn hardhat zarp:sign-message --message "I own 0xb755506531786C8aC63B756BaB1ac387bACB0C04" --env DEPLOYER_PRIVATE_KEY

# Or read from a file and trim trailing newline
yarn hardhat zarp:sign-message --file ./message.txt --trim
```

Flags:

- `--message <text>` direct message
- `--file <path>` read message from file
- `--trim` trim trailing newlines when reading from file
- `--env <VAR>` env var that holds the private key (default DEPLOYER_PRIVATE_KEY)
- `--json` emit JSON (default)

Output (JSON): `address`, `env`, `message`, `signature`, `recovered`, `match`.

#### zarp:impl-slot

Read the EIP-1967 implementation slot from the canonical proxy; resolves overrides and handles fork/local fallbacks.

```sh
yarn hardhat zarp:impl-slot --network sepolia --json
```

Notes:

- On local chainId 31337 with a fork configured, it queries the global canonical address; otherwise it expects the local canonical.
- If no code is present, the task prints structured error JSON with suggestions.

#### zarp:multi-audit

Compare normalized on-chain implementation runtime hashes across supported networks against the local build.

```sh
yarn hardhat zarp:multi-audit --json
```

Output includes per-network fields: `matches`, `onChainHash`, `localHash`, and `lengthDiff` (if any).

Note: The comparison uses normalized runtime bytecode (constructor args/metadata stripped) to avoid false diffs when explorers/providers return variant encodings.

### Archival Snapshots (--archive)

Operational Hardhat tasks can emit an immutable JSON snapshot of their result for audit and diffing. Enable with `--archive` on supported tasks (`deploy:roles`, `zarp:status`, `zarp:flow`, `zarp:upgrade`, `zarp:canonical`).

Path schema (created automatically):

`deployments/records/<network>/<YYYY-MM-DD>/<ISO_TIMESTAMP>-<label>.json`

Labels currently used:

- `deploy` (deploy:roles)
- `status` (zarp:status pre/post states)
- `flow` (zarp:flow summary)
- `upgrade` (zarp:upgrade result)
- `canonical` (zarp:canonical report)

Examples (localhost shown; add `--network sepolia` etc as needed):

```sh
# Deploy & archive (also triggers archived post-status automatically)
yarn hardhat deploy:roles --network localhost \
   --minter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --verifier 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --burner 0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
   --pauser 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
   --upgrader 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc \
   --archive

# Status snapshot (addresses + roles)
yarn hardhat zarp:status --network localhost --archive --json

# Canonical check snapshot
yarn hardhat zarp:canonical --network localhost --archive --json

# Flow demo (verifier->verified mapping->mint->transfer->burn) archived
yarn hardhat zarp:flow --network localhost \
   --verifier 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --minter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --burner 0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
   --recipient 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
   --mint-amount 1000 --transfer-amount 250 --burn-amount 100 \
   --archive --json

# Upgrade snapshot (before/after impl)
yarn hardhat zarp:upgrade --network localhost --impl ZarpV2 --archive --json
```

Retrieving archives:

```sh
ls -1 deployments/records/localhost/$(date +%F) | sed 's/.json$//' | head

# Pretty-print latest status snapshot
latest=$(ls -1 deployments/records/localhost/$(date +%F)/*-status.json | tail -n1)
jq '.' "$latest" | less
```

Guidance:

- Snapshots are append-only; do not edit retroactively (treat as ledger).
- Use version control to commit relevant snapshots if needed for change review (optional—avoid committing excessive local churn).
- Combine `--archive --json --quiet` when you only want machine-readable output + file artifact (minimal console noise).
- Archives intentionally exclude secrets; safe to share internally for audits.
- Post-operation status archives (triggered by some tasks) share the same date directory for temporal grouping.
- For diffing two snapshots: `jq -S '.' a.json > a.norm && jq -S '.' b.json > b.norm && diff -u a.norm b.norm`.

Local (localhost / hardhat) archives & deployment record files are considered transient debugging artifacts and are git-ignored (`deployments/localhost.zarp.json`, `deployments/hardhat.zarp.json`, and their `deployments/records/<network>/` subdirs). Commit only testnet/mainnet archives when they serve a review or audit purpose.

Future Enhancements (roadmap): retention tooling, hash chain anchoring, optional gzip.

### Canonical Address Assertion (CI)

The invariant that every production network uses the same proxy address is enforced by:

- `zarp:assert-canonical`: exits non-zero if the registry address for the current `chainId` has no code (absence) or the network lacks a registry entry. Use with `--json` in CI and optionally `--archive` to persist an attestation snapshot (label `canonical`).
- `deploy:roles`: prevents duplicate deployment if code already exists at the registered canonical address; enforces nonce discipline for new (unregistered) networks (nonce must be 0 unless `--allow-nonce-drift`).
- `zarp:status`: surfaces `expectedCanonicalMatch` (and fails unless `--allow-noncanonical` on local).

Example CI step (polygon shown):

```sh
yarn hardhat zarp:assert-canonical --network polygon --json --archive
```

Result JSON includes: `network`, `chainId`, `expected`, `hasCode`, `expectedCanonicalMatch` (boolean). A failing assertion yields a non-zero exit code and (if `--json`) an error JSON line for log ingestion.

### Safe Role Renounce Sequence (Governance)

Goal: Deployer ends with zero privileged roles once governance safes hold them.

Recommended order (after grants & validation via zarp:status):

1. DEFAULT_ADMIN_ROLE (after confirming another address holds it).
2. UPGRADER_ROLE (post-upgrade tests & readiness).
3. MINTER_ROLE (once operational minter is set and tested).
4. PAUSER_ROLE (keep until confident; or move earlier if emergency process ready).
5. VERIFIER_ROLE & BURNER_ROLE (after operational automation validated).

How to renounce via Safe (no Defender):

1. Open the Safe web app (<https://app.safe.global>), select the governance Safe on the correct chain.
2. Apps → Transaction Builder → New transaction.
3. Add call:
   - To: 0xb755506531786C8aC63B756BaB1ac387bACB0C04
   - Value: 0
   - ABI: Zarp ABI (from artifacts or explorer)
   - Function: renounceRole(bytes32,address)
   - Params:
     - role: bytes32 of the role to renounce (e.g., DEFAULT_ADMIN_ROLE)
     - account: 0x<deployer_address>
4. Submit, collect signatures with hardware wallets, then execute.
5. Repeat for remaining roles in the recommended order.

Optional: generate calldata locally to cross-check the UI entry.

```sh
yarn hardhat console --network sepolia <<'EOF'
const I = new ethers.Interface(["function renounceRole(bytes32,address)"]);
const role = ethers.id("DEFAULT_ADMIN_ROLE");
const account = "0x1111111111111111111111111111111111111111"; // deployer
console.log(I.encodeFunctionData("renounceRole", [role, account]));
EOF
```

Note: Only renounce after confirming a replacement holder is already granted and validated via `zarp:status`.

<!-- duplicate block removed: Coding Standards, Solana workflow, Questions, and Mainnet Fork Simulation (already present above) -->

### Operational Tasks & Examples

Common Hardhat tasks (canonical proxy enforced). Phased rollout guidance lives in internal workplans (not committed); this section is self-contained.

#### deploy:roles

```sh
yarn hardhat deploy:roles --network localhost \
   --minter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --verifier 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --burner 0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
   --pauser 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
   --upgrader 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
```

Flags: `--admin`, `--renounce`, `--renounce-admin` (requires `--admin`), `--no-status`, `--quiet --json`, `--allow-nonce-drift` (only for exceptional new-network deploy when nonce discipline was broken), `--allow-noncanonical` (local only; bypass canonical guard).

#### zarp:status

```sh
yarn hardhat zarp:status --network localhost --json
```

Add addresses & verification:

```sh
yarn hardhat zarp:status --network localhost \
   --address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --address 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --check-verified
```

Fields (JSON):

- `network`, `chainId`
- `proxy`, `implementation`
- `expectedCanonical` (registry value) & `expectedCanonicalMatch` (bool)
- `roles` mapping: `roleName -> [addresses]`
- `supply`, `name`, `symbol`, `decimals`, `version`
- `checkedAddresses` (if provided): array of objects with `address`, `balance`, `rolesHeld`, `isVerified` (if `--check-verified`)

Flags:

- `--address <addr>` repeatable to include balance/role snapshots
- `--check-verified` (attempt explorer verification status for impl + proxy)
- `--allow-noncanonical` (local only, bypass mismatch failure)
- `--archive` (snapshot)
- `--json` machine output; combine with `--quiet` to suppress descriptive lines

#### zarp:flow

```sh
yarn hardhat zarp:flow --network localhost \
   --verifier 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
   --minter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
   --burner 0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
   --recipient 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
   --mint-amount 1000 --transfer-amount 250 --burn-amount 100
```

Flags: `--skip-verify`, `--pre-status`, `--no-status`, `--json`, `--archive`.

#### zarp:upgrade

```sh
yarn hardhat zarp:upgrade --network localhost --impl ZarpV2
```

Flags: `--no-smoke`, `--no-status`, `--json`, `--archive`.

#### zarp:canonical

```sh
yarn hardhat zarp:canonical --network localhost --json
```

Returns canonical expectations & on-chain code presence. Add `--archive` for snapshot.

#### zarp:assert-canonical

Strict CI-oriented assertion of canonical proxy presence & registry match:

```sh
yarn hardhat zarp:assert-canonical --network mainnet
```

Flags: `--json`, `--archive`. Fails non-zero on mismatch or missing code.

#### Canonical Registry & Invariant

The project enforces a uniform global proxy address across supported chains using a dedicated deployer account (nonce discipline) recorded in `tasks/canonicalProxies.ts`.

Registry file maps `chainId -> proxy address`. Do NOT mutate historical entries without governance approval.

Deployment Guard Policy:

- Existing network (in registry): refuse duplicate deploy; recovery deploy only if nonce == 0 for deployer to re-create identical address.
- New network (not in registry): deployer nonce must be 0 unless `--allow-nonce-drift` provided (strongly discouraged).
- Status & assert tasks fail on mismatch unless `--allow-noncanonical` (local only) used.

Add a new chain:

1. Fund fresh deployer (nonce 0).
2. Deploy via `deploy:roles` (no prior txs from deployer).
3. Confirm `zarp:status` shows `expectedCanonicalMatch=true`.
4. Add chainId entry to `canonicalProxies.ts` in same PR as deployment records snapshot (if committing).

### Coding Standards

TypeScript scripts: keep them deterministic, minimal external deps. Solidity: follow existing style; storage gaps reserved for future vars (see `EmptyGap.sol`). Use bigint literals (`1000n`) in tests for ethers v6 compatibility.

## Solana SPL Token Workflow

See `solana/README.md` for build & test ledger instructions. Use the provided Makefile targets.

## Questions / Support

Open a GitHub issue or start a discussion for architectural changes before large PRs.

### Mainnet Fork Simulation

Simulate an upgrade on a fork of mainnet (no real chain writes) using `MAINNET_FORK_URL` and optional `MAINNET_FORK_BLOCK`.

Env vars:

```dotenv
MAINNET_FORK_URL=https://eth-mainnet.alchemyapi.io/v2/<KEY>
MAINNET_FORK_BLOCK=21000000 # optional
PROXY_ADDR=0xMainnetProxy
UPGRADER_ADDR=0xAddressWithUpgraderRole
```

Run:

```sh
MAINNET_FORK_URL=... PROXY_ADDR=0x... UPGRADER_ADDR=0x... yarn hardhat test test/Zarp.fork-upgrade.test.ts
```

Criteria: implementation changes, balances & supply preserved, version() callable.
