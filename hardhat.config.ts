import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import '@openzeppelin/hardhat-defender';

require('dotenv').config();
const {
  INFURA_API_KEY: apiKey,
  DEPLOYER_PRIVATE_KEY: deployerKey,
  ETHERSCAN_API_KEY: etherscanKey,
  DEFENDER_API_KEY: defenderKey,
  DEFENDER_SECRET: defenderSecret,
} = process.env;
if (!apiKey) throw new Error('No INFURA_API_KEY in dotenv');
if (!deployerKey) throw new Error('No DEPLOYER_PRIVATE_KEY in dotenv');
if (!etherscanKey) throw new Error('No ETHERSCAN_API_KEY in dotenv');
if (!defenderKey) throw new Error('No DEFENDER_API_KEY in dotenv');
if (!defenderSecret) throw new Error('No DEFENDER_SECRET in dotenv');

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
  },
  etherscan: {
    apiKey: etherscanKey,
  },
  defender: {
    apiKey: defenderKey,
    apiSecret: defenderSecret,
  },
};

export default config;
