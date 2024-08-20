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
yarn hardhat run scripts/Deploy.ts --network sepolia
# To upgrade testnet contract (NB: Make sure UPGRADEABLE_ADDRESS is set correctly in `Deploy.ts`):
yarn hardhat run scripts/Upgrade.ts --network sepolia
# Verifying deployed contract. Be sure to use the correct address & network:
yarn hardhat verify --network sepolia 0xb755506531786C8aC63B756BaB1ac387bACB0C04
```

## Tests

Before submitting a PR, make sure that all tests pass

`yarn test`
