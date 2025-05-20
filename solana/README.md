# Solana SPL Token Utility

## Version History 🕰️

This directory now manages **Version 2** of the ZARP Solana SPL token. We migrated from **Version 1**, which shipped with two mandatory extensions:

- **Default Account State**: new accounts were always initialized with a default state, disallowing manual control.
- **Confidential Transfers**: on-chain encryption of transfer amounts for privacy, but impossible to disable.

### Version 2 Highlights 🚀

- Minimal essential extensions enabled where needed (metadata, freeze, close)

## Deployed Addresses 📦

| Version | Network | Address                                                                                                                                                    |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1      | Mainnet | [8v8aBHR7EXFZDwaqaRjAStEcmCj6VZi5iGq1YDtyTok6](https://solana.fm/address/8v8aBHR7EXFZDwaqaRjAStEcmCj6VZi5iGq1YDtyTok6/transactions?cluster=mainnet-alpha)  |
| v2      | Devnet  | [FNijoBcYNp1U9xXDcZRkEbX6vNV24BamDQBhkRTCzLRP](https://solana.fm/address/FNijoBcYNp1U9xXDcZRkEbX6vNV24BamDQBhkRTCzLRP/transactions?cluster=devnet-alpha)   |
| v2      | Testnet | [8Rb9pcgbAaSVwgJxFBpvFDoD3ZGkWDFDMfuDbVKkycmu](https://solana.fm/address/8Rb9pcgbAaSVwgJxFBpvFDoD3ZGkWDFDMfuDbVKkycmu/transactions?cluster=testnet-solana) |

This directory uses a `Makefile` to create and manage a ZARP SPL token on a local or Devnet Solana cluster.

## Table of Contents

- [Solana SPL Token Utility](#solana-spl-token-utility)
  - [Version History 🕰️](#version-history-️)
    - [Version 2 Highlights 🚀](#version-2-highlights-)
  - [Deployed Addresses 📦](#deployed-addresses-)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites 🔧](#prerequisites-)
  - [Local Development 🚀](#local-development-)
  - [Devnet 🌐](#devnet-)
  - [Network Targets 🛠️](#network-targets-️)
  - [Best Practices](#best-practices)
    - [Example SPL-Token Workflow](#example-spl-token-workflow)
  - [Known Issues](#known-issues)

## Prerequisites 🔧

Follow Solana’s guide to install the local validator and CLI tool:

```sh
# Install and configure local validator
solana config set --url localhost
solana config get
# Generate a new keypair
solana-keygen new --outfile ~/.config/solana/id.json
# Airdrop some SOL for fees
solana airdrop 2
solana balance
# Show solana wallet pubkey / address since you will need it for future steps
solana address
```

You will need your wallet address for the environment variables:

```bash
export MINT_AND_BURN_ADDRESS=<your_wallet_pubkey>
export DEPLOYER_ADDRESS=<your_wallet_pubkey>
export OWNER_ADDRESS=<your_wallet_pubkey>
```

Run `make help` for a fun list of available actions!

```
make help
```

## Local Development 🚀

Spin up your sandbox and create tokens in just a few steps:

1. Launch the local validator:

   ```bash
   make local-sol
   ```

   (If you need a fresh start, use `make reset-local-sol`.)

2. In a new shell, point your CLI at localhost and export wallets:

   ```bash
   solana config set --url localhost
   export MINT_AND_BURN_ADDRESS=$(solana address)
   export DEPLOYER_ADDRESS=$(solana address)
   export OWNER_ADDRESS=$(solana address)
   ```

3. Create & configure a new ZARP token:

   ```bash
   make create-token
   ```

4. Inspect your shiny new token:
   ```bash
   cat .create-token/token_address.txt      # Mint address
   tail -n +1 .create-token/create-token-output.log  # Full logs
   ```

## Devnet 🌐

Switch to Devnet, airdrop some SOL, and reuse the same workflow:

```bash
make set-devnet
solana airdrop 1
export MINT_AND_BURN_ADDRESS=$(solana address)
export DEPLOYER_ADDRESS=$(solana address)
export OWNER_ADDRESS=$(solana address)
make create-token
```

## Network Targets 🛠️

The Makefile includes convenient `set-<network>` targets to configure your Solana CLI and recommended wait times for different environments:

- **make set-local**  
  Points CLI to your local validator at `http://localhost:8899` and sets `WAIT_TIME=0.5`.

- **make set-devnet**  
  Switches to Devnet (`https://api.devnet.solana.com`) with `WAIT_TIME=1` (you can airdrop SOL).

- **make set-testnet**  
  Switches to Testnet (`https://api.testnet.solana.com`) with commitment `confirmed` and `WAIT_TIME=5`.

- **make set-mainnet**  
  Switches to Mainnet-Beta (`https://api.mainnet-beta.solana.com`) with `WAIT_TIME=20`. Make sure you have real SOL and funded accounts (no airdrop).

After running any `set-<network>` target, update your wallet environment variables for that network:

```bash
export MINT_AND_BURN_ADDRESS=<your_wallet_pubkey>
export DEPLOYER_ADDRESS=<your_wallet_pubkey>
export OWNER_ADDRESS=<your_wallet_pubkey>
solana balance
```

Then run:

```bash
make create-token
```

## Best Practices

We adhere to Solana and SPL-Token CLI best practices when creating and managing SPL tokens:

1. Use the Token-2020 program extensions by specifying the `--program-id` flag.  
   See https://spl.solana.com/token-2022 for details.

2. Immediately initialize on-chain metadata for your mint:

   ```sh
   spl-token initialize-metadata <MINT_ADDRESS> <NAME> <SYMBOL> <URI>
   ```

   Docs: https://spl.solana.com/token#token-metadata

3. Always use Associated Token Accounts instead of raw accounts:

   ```sh
   spl-token create-account <MINT_ADDRESS>
   spl-token address --token <MINT_ADDRESS> --owner <OWNER> --verbose
   ```

   See https://spl.solana.com/token#associated-token-account

4. Transfer all authorities (mint, freeze, metadata, etc.) off the deployer to your designated multisig or governance keys.
5. Revoke any zero-amount approvals to the deployer ATA.

### Example SPL-Token Workflow

```sh
# 1. Create mint
spl-token --program-id <TOKEN_2020_ID> create-token --decimals 6 --default-account-state initialized \
  --enable-metadata --enable-freeze --enable-close

# 2. Initialize metadata
spl-token --program-id <TOKEN_2020_ID> initialize-metadata <MINT_ADDRESS> "<NAME>" "<SYMBOL>" <URI>

# 3. Create Associated Token Account
spl-token --program-id <TOKEN_2020_ID> create-account <MINT_ADDRESS>

# 4. Approve and transfer authorities
spl-token --program-id <TOKEN_2020_ID> approve <ATA> 0 <DEPLOYER_ATA>
spl-token --program-id <TOKEN_2020_ID> authorize <MINT_ADDRESS> mint <MINT_AND_BURN_AUTHORITY>
spl-token --program-id <TOKEN_2020_ID> authorize <MINT_ADDRESS> freeze <MINT_AND_BURN_AUTHORITY>
# ... other authorize commands ...
spl-token --program-id <TOKEN_2020_ID> revoke <DEPLOYER_ATA>

# 5. Mint tokens
spl-token --program-id <TOKEN_2020_ID> mint <MINT_ADDRESS> 100000

# 6. Display mint
spl-token --program-id <TOKEN_2020_ID> display <MINT_ADDRESS>
```

## Known Issues

- Hardware wallets in WSL2 require USB passthrough: see Microsoft’s [WSL2 USB guide](https://learn.microsoft.com/windows/wsl/connect-usb).
- If `solana-test-validator` fails, install `bzip2` or check logs:
  ```sh
  sudo apt-get install bzip2
  tail test-ledger/validator.log
  ```
- Devnet faucets can be unreliable; try:
  - https://faucet.solana.com/
  - https://faucet.quicknode.com/solana/devnet
