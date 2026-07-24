import { expect } from 'chai';
import { explorerRequest, explorerResponseAccepted } from '../tasks/explorerPing';

describe('Explorer ping', () => {
  it('uses Etherscan V2 with the selected chain ID', () => {
    const request = explorerRequest('https://api-sepolia.basescan.org/api', 84532, 'test-key');
    const url = new URL(request.url);

    expect(request.apiVersion).to.equal('v2');
    expect(url.origin + url.pathname).to.equal('https://api.etherscan.io/v2/api');
    expect(url.searchParams.get('chainid')).to.equal('84532');
    expect(url.searchParams.get('apikey')).to.equal('test-key');
  });

  it('rejects deprecated V1 NOTOK responses', () => {
    const raw = {
      status: '0',
      message: 'NOTOK',
      result: 'You are using a deprecated V1 endpoint',
    };

    expect(explorerResponseAccepted(false, true, raw)).to.equal(false);
  });

  it('accepts successful Etherscan V2 responses', () => {
    expect(explorerResponseAccepted(false, true, { status: '1', message: 'OK', result: '0' })).to.equal(true);
  });
});
