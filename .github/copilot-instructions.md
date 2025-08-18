# Copilot Collaboration Instructions (Authoritative)

(This is the canonical location; root file is a pointer.)

## Project Snapshot

Purpose: Upgradeable ZARP ERC20 stablecoin with on-chain verification (VERIFIER_ROLE + mapping) gating mint & burn, using OpenZeppelin UUPS.

Core Contracts:

- contracts/Zarp.sol — main token (roles, verification, UUPS)
- contracts/EmptyGap.sol — storage gap helper
- (Artifacts include ZarpV2 for upgrade tests)

Roles:

- DEFAULT_ADMIN_ROLE: governance meta-admin (migrate to Safe, then renounce on deployer)
- MINTER_ROLE: mint to verified addresses only
- VERIFIER_ROLE: set/unset verified mapping
- BURNER_ROLE: burn/burnFrom; transfers to burner require sender verified
- PAUSER_ROLE: pause/unpause
- UPGRADER_ROLE: authorize UUPS upgrades

Deployment:

- Single Hardhat task `deploy:roles` (see tasks/deployRoles.ts) calling `scripts/lib/deployShared.ts`.
- Flags: --admin --minter --verifier --burner --pauser --upgrader --renounce --renounce-admin --no-grant --quiet --json
- Safety: --renounce-admin requires --admin; admin renounce only if replacement provided.

Testing:

- test/Zarp.test.ts (core)
- test/Zarp.upgrade.test.ts (upgrade state integrity)
- test/Zarp.fork-upgrade.test.ts (optional fork simulation; env-driven)

Networks (configured): localhost, hardhat (fork capable), goerli (legacy), sepolia, mainnet, polygon/polygonAmoy, base/baseSepolia, gnosisChiado, gnosis.

Env Vars: ALCHEMY_API_KEY, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY, BASESCAN_SEPOLIA_KEY, POLYGONSCAN_API_KEY, MAINNET_FORK_URL, MAINNET_FORK_BLOCK.

## Rules

Formatting & Style:

- Never truncate addresses; always full 42-char 0x addresses.
- No ellipses inside addresses.
- Top-level list items start at column 0; sub-items indent two spaces.
- Keep commands single-line where possible; explicitly show all used flags.
- All console commands MUST be in fenced code blocks with language sh (```sh) for copy reliability.
- Maintain single canonical proxy address per context:
  - Global (testnets/mainnets): 0xb755506531786C8aC63B756BaB1ac387bACB0C04
  - Local (hardhat/localhost): 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
    No second deployments; all upgrades/flows must target only the canonical for that network.

Workflow:

- Stage process/docs in WORKPLAN.md first; promote to CONTRIBUTING.md when stable.
- Only use deploy:roles for new deployments (no legacy scripts).
- Centralize deploy logic changes in deployShared.ts.
- Add safety guards for any destructive role action.

Safety:

- Don’t renounce DEFAULT_ADMIN_ROLE without a replacement admin granted.
- Call out privilege-reducing actions clearly.
- Avoid assumptions about current role state unless derived from code or explicit input.

Testing & Validation:

- Run focused tests when altering upgrade logic or role flows (upgrade + core tests).
- Ensure type errors / lint pass after task or script edits.

Documentation Examples:

- Provide concrete full addresses & sample JSON outputs.
- Declare required env vars before commands that depend on them.

Change Management:

- Minimal diffs only; no unrelated reformat.
- Summaries must state what changed and why; omit unchanged context repetition.

## Key Commands

Local deploy w/ roles:
`yarn hardhat deploy:roles --minter 0x1111111111111111111111111111111111111111 --verifier 0x2222222222222222222222222222222222222222 --burner 0x3333333333333333333333333333333333333333 --pauser 0x4444444444444444444444444444444444444444 --upgrader 0x5555555555555555555555555555555555555555`

Safe admin handoff:
`yarn hardhat deploy:roles --admin 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA --minter 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB --verifier 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC --burner 0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD --pauser 0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE --upgrader 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF --renounce-admin`

JSON only:
`yarn hardhat deploy:roles --quiet --json`

Upgrade test:
`yarn hardhat test test/Zarp.upgrade.test.ts`

Fork upgrade simulation:
`MAINNET_FORK_URL=https://eth-mainnet.alchemyapi.io/v2/<KEY> PROXY_ADDR=0xProxyAddr UPGRADER_ADDR=0xUpgrader yarn hardhat test test/Zarp.fork-upgrade.test.ts`

### Forking Notes

- Hardhat's in-process network always reports chainId 31337 even when forking mainnet or Sepolia. Detect a fork by checking `network.config.forking` or observing non-zero code at a known remote address.
- To fork Sepolia at the latest block, set `SEPOLIA_FORK_URL` and omit `SEPOLIA_FORK_BLOCK` or set it to `latest`. The config treats missing or `latest` as "no blockNumber" so the provider uses the current head.
- If both `MAINNET_FORK_URL` and `SEPOLIA_FORK_URL` are set, `MAINNET_FORK_URL` takes precedence.

## Prompt Template

```
You are assisting on zarp.contract. Use .github/copilot-instructions.md rules.
Critical: full addresses; deploy:roles only; no admin renounce w/out replacement; minimal diffs; stage docs in WORKPLAN.md first.
Provide concrete, copyable commands.
```

## Do / Don’t

Do: full addresses, centralized deploy logic, safety guards, focused tests for upgrades.
Don’t: truncate addresses, invent new deploy scripts, renounce admin without replacement, broad reformat.

---

Changelog:

- 2025-08-11: Canonical file created (migrated from root).
- 2025-08-12: Added Action Verification Policy (no unverified claims of edits/deletes/creates).
  \*\*\* End File

## Action Verification Policy (Enforced)

The assistant MUST NOT claim to have performed an action (create/edit/delete/move file, run tests, format, deploy) unless:

1. A tool invocation in this session actually executed that action (apply_patch, create_file, delete file via patch, run tests, terminal command, etc.).
2. The tool returned without error and (for file ops) the resulting file content or absence is observable.
3. The summary explicitly reflects only what succeeded; partial failures must be called out.

Rules:

- Never state a file was deleted unless a delete patch for that exact path was applied successfully.
- If a patch fails or is retried, report the failure before any succeeding attempt claim.
- If multiple files are changed, list only those actually patched (no extrapolation).
- Do not infer side-effects (e.g. “formatted all files”) unless a formatter command was run and confirmed.
- When unsure of final state, request validation instead of asserting completion.
- Always prefer: “Planned X; executed Y (tool confirmed); pending Z.” over blanket completion claims.

Explicit Don’ts:

- Don’t say “removed”, “deleted”, “renamed”, “refactored”, “updated docs” without observable tool evidence.
- Don’t summarize unchanged files as modified.
- Don’t claim tests pass without running them.
- Don’t claim lint/style fixes without invoking the linter/formatter.

Success Assertion Template:

> Files changed (tool-confirmed): <list>. No other files touched.

Escalation:

- If a requested destructive action (delete/rename) cannot be verified, halt and ask for explicit confirmation or provide diff preview.

Auditing:

- All action claims must be traceable to tool logs in the conversation. Any deviation is a policy violation.

Purpose:

- Preserve operator trust and ensure traceability of every claimed change.
