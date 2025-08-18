import { task } from 'hardhat/config';
// Use global fetch (Node 18+ / Hardhat runtime). No external dependency required.

/*
Task: zarp:explorer-ping
Purpose: Lightweight validation that a supplied explorer API key (Etherscan-compatible or Blockscout) is accepted
by the remote service before attempting a full contract verification.

Approach:
- Uses the network specified (e.g. --network gnosisChiado) to choose the correct API base URL from the configured
  etherscan.customChains or built-in mapping.
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
    const { network, config } = hre;
    const jsonOnly = !!args.json;
    const name = network.name;

    // Resolve API key based on etherscan.apiKey mapping in config
    const apiKeyConfig: any = config.etherscan?.apiKey || {};
    const apiKey: string | undefined = typeof apiKeyConfig === 'string' ? apiKeyConfig : apiKeyConfig[name];

    // Find customChains entry for this network to get apiURL
    const customChains: any[] = config.etherscan?.customChains || [];
    const entry = customChains.find(c => c.network === name);
    if (!entry) {
      throw new Error(`No customChains entry found for network ${name}; cannot determine explorer API URL.`);
    }
    const apiURL: string = entry.urls.apiURL;

    if (!apiKey) {
      throw new Error(`No API key configured for network ${name} (env missing?).`);
    }

    const url = `${apiURL}?module=account&action=balance&address=0x0000000000000000000000000000000000000000&tag=latest&apikey=${apiKey}`;

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
        // Etherscan style: { status: '1', message: 'OK', result: '...' }
        // Blockscout style may omit status/message; treat absence of explicit error as ok if HTTP 200.
        const lower = JSON.stringify(raw).toLowerCase();
        if (res.ok && !lower.includes('invalid') && !lower.includes('error')) {
          status = 'ok';
        }
        if (lower.includes('invalid') || lower.includes('error')) {
          status = 'error';
        }
      } else if (res.ok) {
        status = 'ok';
      }
    } catch (e: any) {
      apiMessage = e.message;
      status = 'error';
    }

    const report = { network: name, apiURL, status, httpStatus, apiMessage, raw };
    if (jsonOnly) {
      console.log(JSON.stringify(report));
    } else {
      console.log('Explorer ping report:', report);
    }
  });
