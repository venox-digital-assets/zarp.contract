import { expect } from 'chai';
import { canonicalProxies, CANONICAL_PROXY_ADDRESS } from '../tasks/canonicalProxies';

describe('Canonical Registry', () => {
  it('exports expected constant address', () => {
    expect(CANONICAL_PROXY_ADDRESS).to.match(/^0x[0-9a-fA-F]{40}$/);
  });
  it('all chain mappings point to the constant address', () => {
    for (const [chain, addr] of Object.entries(canonicalProxies)) {
      expect(addr.toLowerCase()).to.equal(CANONICAL_PROXY_ADDRESS.toLowerCase(), `Mismatch for chain ${chain}`);
    }
  });
  it('has no duplicate conflicting addresses', () => {
    const unique = new Set(Object.values(canonicalProxies).map(a => a.toLowerCase()));
    expect(unique.size).to.equal(1);
  });
});
