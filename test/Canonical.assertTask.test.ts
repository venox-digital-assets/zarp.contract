import { expect } from 'chai';
import '../tasks/zarpAssertCanonical'; // ensure task registers without throwing
import { canonicalProxies, CANONICAL_PROXY_ADDRESS } from '../tasks/canonicalProxies';

describe('Canonical Assert Task Registration', () => {
  it('task registry loads canonical proxies', () => {
    expect(Object.values(canonicalProxies).length).to.be.greaterThan(0);
    for (const addr of Object.values(canonicalProxies)) {
      expect(addr.toLowerCase()).to.equal(CANONICAL_PROXY_ADDRESS.toLowerCase());
    }
  });
});
