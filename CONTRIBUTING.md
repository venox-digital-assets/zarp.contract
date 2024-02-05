# ZARP Contribution Guide

## Principles

Brief list of principles, and impact on tech:

- Use and trust openzeppelin. We believe that sticking to battle-tested open-source implementations results in simple, robust and secure contracts
- Test-driven, but don't recreate all the openzeppelin tests (see above)

## Setup

- Configure .env with the following settings:

```dotenv
INFURA_API_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
DEPLOYER_PRIVATE_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
ETHERSCAN_API_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
DEFENDER_API_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
DEFENDER_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

## Running the project

```sh
yarn
yarn hardhat test
yarn hardhat run scripts/Deploy.ts
# To deploy to testnet:
yarn hardhat run scripts/Deploy.ts --network goerli
# To upgrade testnet contract (NB: Make sure UPGRADEABLE_ADDRESS is set correctly in `Deploy.ts`):
yarn hardhat run scripts/Upgrade.ts --network goerli
# Verifying deployed contract. Be sure to use the correct address & network:
yarn hardhat verify --network goerli 0xb755506531786C8aC63B756BaB1ac387bACB0C04
```

## Solana

Solana version of ZARP is created on the SPL Token Program (with some of the Token-2020 program extrensions).This is wrapped into the Makefile:

Install Local Dev Solana Environment from here: <https://docs.solana.com/getstarted/local>
Then also create a wallet and airdrop as per the instructions above. Something like:

```sh
solana config set --url localhost
solana config get
solana-keygen new
solana config set -k ~/.config/solana/id.json
solana airdrop 2
solana balance
```

To create the token against the local validator:

```sh
# Run the local test chain:
make local-sol

# In seperate terminal, ensure we're pointing to the local validator and create the token:
solana config set --url localhost
make create-token

# The created token address is saved in:
cat .create-token/token_address.txt

# The logs are saved in:
cat .create-token/create-token-output.log

```

### Devnet

This command _should_ airdrop correctly for Devnet, but mine kept failing with error: ``

```sh
solana config set --url https://api.devnet.solana.com
solana airdrop 1 --url devnet

```

Fauceting on Devnet was actually a nightmare. Kept failing on all Web faucets as well. Finally one of the following worked:

- <https://faucet.solana.com/>
- <https://faucet.quicknode.com/solana/devnet>

## Tests

Before submitting a PR, make sure that all tests pass

`yarn test`
