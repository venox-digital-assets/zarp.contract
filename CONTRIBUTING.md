# ZARP Contribution Guide

Building and maintaining ZARP involves smart contracts on Ethereum and an SPL token on Solana. This guide explains how to set up, test, and contribute.

## Table of Contents

- [ZARP Contribution Guide](#zarp-contribution-guide)
  - [Table of Contents](#table-of-contents)
  - [Principles](#principles)
  - [Setup](#setup)
  - [Running the Project](#running-the-project)
  - [Tests](#tests)
  - [Solana SPL Token Workflow](#solana-spl-token-workflow)

## Principles

We follow these core principles:

- Trust and reuse battle-tested code (e.g. OpenZeppelin libraries).
- Write tests for new features; avoid duplicating upstream tests.
- Keep contracts simple, secure, and well-documented.

## Setup

1. Clone the repo and install dependencies:
   ```sh
   yarn install
   ```
2. Create a `.env` file based on `.env.example` with these variables:
   ```dotenv
   INFURA_API_KEY=...
   DEPLOYER_PRIVATE_KEY=...
   ETHERSCAN_API_KEY=...
   DEFENDER_API_KEY=...
   DEFENDER_SECRET=...
   ```

## Running the Project

Compile and deploy your changes locally or to testnets:

```sh
# Run tests
yarn hardhat test

# Deploy to local Hardhat network
yarn hardhat run scripts/Deploy.ts

# Deploy to Sepolia testnet
yarn hardhat run scripts/Deploy.ts --network sepolia

# Upgrade (ensure UPGRADEABLE_ADDRESS is set in Deploy.ts)
yarn hardhat run scripts/Upgrade.ts --network sepolia

# Verify on Etherscan
yarn hardhat verify --network sepolia <DEPLOYED_ADDRESS>
```

## Tests

Before submitting a PR, ensure all tests pass:

```sh
yarn test
```

## Solana SPL Token Workflow

For the Solana SPL token utility (creating and managing ZARP tokens on Solana), see:

- `solana/README.md`: instructions and Makefile targets.

Contributions to the Solana module should follow the patterns in that README.
