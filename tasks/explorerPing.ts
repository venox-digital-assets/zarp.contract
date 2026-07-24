import { task } from 'hardhat/config';
// Use global fetch (Node 18+ / Hardhat runtime). No external dependency required.

export function explorerRequest(configuredApiURL: string, chainId: number, apiKey: string) {
  const isBlockscout = /blockscout/i.test(configuredApiURL);
  const apiURL = isBlockscout ? configuredApiURL : 'https://api.etherscan.io/v2/api';
  const params = new URLSearchParams({
    module: 'account',
    action: 'balance',
    address: '0x0000000000000000000000000000000000000000',
    tag: 'latest',
    apikey: apiKey,
  });
  if (!isBlockscout) params.set('chainid', String(chainId));
  return { apiURL, apiVersion: isBlockscout ? 'blockscout' : 'v2', isBlockscout, url: `${apiURL}?${params}` };
}

export function explorerResponseAccepted(isBlockscout: boolean, httpOk: boolean, raw: any): boolean {
  if (!httpOk || !raw || typeof raw !== 'object') return false;
  const lower = JSON.stringify(raw).toLowerCase();
  const explicitError = lower.includes('invalid') || lower.includes('error') || raw.message === 'NOTOK';
  const accepted = isBlockscout ? raw.status === undefined || raw.status === '1' : raw.status === '1';
  return accepted && !explicitError;
}

/*
Task: zarp:explorer-ping
Purpose: Lightweight validation that a supplied explorer API key (Etherscan-compatible or Blockscout) is accepted
by the remote service before attempting a full contract verification.

Approach:
- Uses Etherscan API V2 with the current chain ID for Etherscan-family explorers.
- Retains the configured custom-chain endpoint for Blockscout networks.
- Sends a trivial module=account action=balance request for the zero address (harmless) including the API key.
- Evaluates HTTP + JSON response for typical success vs invalid key indicators.

Output Fields (JSON):
  network, apiURL, status: 'ok' | 'error', httpStatus, apiMessage, raw (original JSON)

Flags:
  --json : emit JSON only
  --quiet : suppress friendly lines (Hardhat standard flag is supported automatically)

Limitations:
- Some Blockscout instances may not strictly require a key; in such cases status ok is returned if HTTP 200 and no error message.
- Does not guarantee rate limits will allow subsequent verify calls; only basic key acceptance.
*/

task('zarp:explorer-ping', 'Validate configured explorer API key for current network')
  .addFlag('json', 'Emit JSON only')
  .setAction(async (args, hre) => {
    const { network, config, ethers } = hre;
    const jsonOnly = !!args.json;
    const name = network.name;

    let chainId = network.config.chainId as number | undefined;
    if (chainId === undefined) {
      chainId = Number((await ethers.provider.getNetwork()).chainId);
    }

    // Resolve API key based on etherscan.apiKey mapping in config
    const apiKeyConfig: any = config.etherscan?.apiKey || {};
    const apiKey: string | undefined = typeof apiKeyConfig === 'string' ? apiKeyConfig : apiKeyConfig[name];

    // Find customChains entry for this network to get apiURL
    const customChains: any[] = config.etherscan?.customChains || [];
    const entry = customChains.find(c => c.network === name);
    if (!entry) {
      throw new Error(`No customChains entry found for network ${name}; cannot determine explorer API URL.`);
    }
    const configuredApiURL: string = entry.urls.apiURL;

    if (!apiKey) {
      throw new Error(`No API key configured for network ${name} (env missing?).`);
    }

    const { apiURL, apiVersion, isBlockscout, url } = explorerRequest(configuredApiURL, chainId, apiKey);

    let httpStatus: number | undefined;
    let apiMessage: string | undefined;
    let status: 'ok' | 'error' = 'error';
    let raw: any = undefined;
    try {
      const res = await fetch(url, { method: 'GET' });
      httpStatus = res.status;
      raw = await res.json().catch(() => undefined);
      if (raw && typeof raw === 'object') {
        apiMessage = raw.message || raw.status || raw.result || undefined;
        if (explorerResponseAccepted(isBlockscout, res.ok, raw)) status = 'ok';
      }
    } catch (e: any) {
      apiMessage = e.message;
      status = 'error';
    }

    const report = { network: name, chainId, apiVersion, apiURL, status, httpStatus, apiMessage, raw };
    if (jsonOnly) {
      console.log(JSON.stringify(report));
    } else {
      console.log('Explorer ping report:', report);
    }
  });
