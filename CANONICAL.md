# Canonical Proxy Invariant

The ZARP proxy uses a single uniform address across production networks (Ethereum Mainnet, Polygon, Base, Arbitrum) derived from a dedicated deployer account with nonce discipline (first transaction deploys the proxy). This file documents the invariant and operational guardrails.

## Invariant Statement

For each registered chainId in `tasks/canonicalProxies.ts`, the proxy address on-chain MUST equal the recorded address and MUST contain proxy bytecode (non-empty code). No secondary proxy deployments are permitted.

## Rationale

- Simplifies integrator configuration (one published address per chain, identical value for all current chains).
- Facilitates monitoring & incident response with a static target.
- Allows deterministic recovery (fresh deployer nonce 0) in catastrophic loss scenarios.

## Registry

Source of truth: `tasks/canonicalProxies.ts`

- Do not modify existing mappings without governance approval.
- Add new chain entries only after a successful deployment & verification.

## Deployment Policy

1. New Chain (not in registry):
   - Use the canonical deployer with nonce 0.
   - Run `deploy:roles`. Guard enforces nonce discipline unless `--allow-nonce-drift` (should never be routine).
   - Verify with `zarp:status` (expectedCanonicalMatch=true) then add mapping.
2. Existing Chain (in registry):
   - Deployment task aborts if code already present (prevents accidental duplicate).
   - Recovery: only if code is absent AND deployer nonce still 0.

## Tasks & Enforcement

- `zarp:status`: Fails on mismatch unless `--allow-noncanonical` (local only) is supplied.
- `zarp:assert-canonical`: CI gate; exits non-zero on mismatch or absent code.
- `deploy:roles`: Guards against duplicate or drift.

## Archive Observability

Each `--archive` status snapshot records: network, chainId, expectedCanonical, proxyResolved, expectedCanonicalMatch. These provide an append-only trail of invariant attestations.

## Adding a Chain (Checklist)

- [ ] Fund deployer, confirm nonce 0.
- [ ] `yarn hardhat deploy:roles --network <chain>` (no extra txs before).
- [ ] `yarn hardhat zarp:status --network <chain> --json` (check expectedCanonicalMatch=true).
- [ ] `yarn hardhat zarp:assert-canonical --network <chain>` passes.
- [ ] Add chainId mapping to `tasks/canonicalProxies.ts`.
- [ ] Commit archival snapshots (optional) and open PR.

## Future Considerations

- CREATE2 migration deferred; only reconsider if deployer nonce discipline becomes untenable.
- Potential hash chain over archive snapshots for stronger audit trail.
