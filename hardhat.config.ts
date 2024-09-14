import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-verify';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-ethers';
import '@typechain/hardhat';

require('dotenv').config();

const {
  ALCHEMY_API_KEY: apiKey,
  DEPLOYER_PRIVATE_KEY: deployerKey,
  ETHERSCAN_API_KEY: etherscanKey,
  DEFENDER_API_KEY: defenderKey,
  DEFENDER_SECRET: defenderSecret,
  BASESCAN_SEPOLIA_KEY: basescanSepoliaKey,
  POLYGONSCAN_API_KEY: polygonscanKey,
} = process.env;
if (!apiKey) throw new Error('No ALCHEMY_API_KEY in dotenv');
if (!deployerKey) throw new Error('No DEPLOYER_PRIVATE_KEY in dotenv');
if (!etherscanKey) throw new Error('No ETHERSCAN_API_KEY in dotenv');
if (!defenderKey) throw new Error('No DEFENDER_API_KEY in dotenv');
if (!defenderSecret) throw new Error('No DEFENDER_SECRET in dotenv');
if (!basescanSepoliaKey) throw new Error('No BASE_SEPOLIA_KEY in dotenv');
if (!polygonscanKey) throw new Error('No POLYGONSCAN_API_KEY in dotenv');

const config: HardhatUserConfig = {
  solidity: '0.8.18',
  networks: {
    goerli: {
      url: `https://goerli.infura.io/v3/${apiKey}`,
      accounts: [deployerKey],
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${apiKey}`,
      accounts: [deployerKey],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${apiKey}`,
      accounts: [deployerKey],
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
      accounts: [deployerKey],
    },
    polygonAmoy: {
      url: `https://polygon-amoy.g.alchemy.com/v2/${apiKey}`,
      accounts: [deployerKey],
    },
    polygonMainnet: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
      accounts: [deployerKey],
    },
    baseSepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${apiKey}`,
      accounts: [deployerKey],
    },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${apiKey}`,
      accounts: [deployerKey],
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
  },
  etherscan: {
    apiKey: {
      mainnet: apiKey,
      baseSepolia: basescanSepoliaKey,
      polygonAmoy: polygonscanKey,
      polygon: polygonscanKey,
      base: basescanSepoliaKey,
    },
    customChains: [
      {
        network: 'polygon',
        chainId: 137,
        urls: {
          apiURL: 'https://api.polygonscan.com/api',
          browserURL: 'https://polygonscan.com',
        },
      },
      {
        network: 'polygonAmoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
  defender: {
    apiKey: defenderKey,
    apiSecret: defenderSecret,
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6', // Ensures TypeChain generates types for Ethers v6
  },
};

export default config;
