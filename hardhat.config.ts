import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-verify';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@typechain/hardhat';

import * as dotenv from 'dotenv';
dotenv.config();

// Load custom tasks
import './tasks/deployRoles';
import './tasks/zarpFlow';
import './tasks/zarpCanonical';
import './tasks/upgradeProxy';
import './tasks/zarpStatus';
import './tasks/zarpAssertCanonical';
import './tasks/backfillRecord';
import './tasks/verifyContracts';
import './tasks/estimateGas';
import './tasks/explorerPing';
import './tasks/bytecodeDiff';
import './tasks/implSlot';
import './tasks/multiAudit';
import './tasks/signMessage';
import './tasks/auditAdmins';

const { ALCHEMY_API_KEY, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY, MULTICHAIN_ETHERSCAN_API_KEY, DEFENDER_API_KEY, DEFENDER_SECRET } =
  process.env;

const MAINNET_FORK_URL = process.env.MAINNET_FORK_URL;
const MAINNET_FORK_BLOCK = process.env.MAINNET_FORK_BLOCK ? parseInt(process.env.MAINNET_FORK_BLOCK) : undefined;
const SEPOLIA_FORK_URL = process.env.SEPOLIA_FORK_URL;
let SEPOLIA_FORK_BLOCK: number | undefined = undefined;
if (process.env.SEPOLIA_FORK_BLOCK && process.env.SEPOLIA_FORK_BLOCK.toLowerCase() !== 'latest') {
  const parsed = parseInt(process.env.SEPOLIA_FORK_BLOCK, 10);
  if (!isNaN(parsed)) SEPOLIA_FORK_BLOCK = parsed;
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.18',
    settings: {
      // Match mainnet verified settings: optimization disabled (runs value ignored when disabled)
      optimizer: { enabled: false, runs: 200 },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    hardhat: MAINNET_FORK_URL
      ? {
          forking: {
            url: MAINNET_FORK_URL,
            blockNumber: MAINNET_FORK_BLOCK,
          },
        }
      : SEPOLIA_FORK_URL
      ? {
          forking: {
            url: SEPOLIA_FORK_URL,
            blockNumber: SEPOLIA_FORK_BLOCK,
          },
        }
      : {},
    goerli: {
      url: `https://goerli.infura.io/v3/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    sepolia: {
      // Use Alchemy endpoint; previous Infura-style URL caused invalid project id errors when using an Alchemy key.
      url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    mainnet: {
      // Switch to Alchemy for consistency with other networks.
      url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    polygonAmoy: {
      url: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    polygonMainnet: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    baseSepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY ?? ''}`,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    gnosisChiado: {
      // Simple: prefer Alchemy if key present, else public Chiado RPC.
      url: ALCHEMY_API_KEY ? `https://gnosis-chiado.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : 'https://rpc.chiadochain.net',
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
    gnosis: {
      // Simple: prefer Alchemy if key present, else public RPC.
      url: ALCHEMY_API_KEY ? `https://gnosis-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : 'https://rpc.gnosischain.com',
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : undefined,
    },
  },
  etherscan: {
    // Etherscan v2 migration: use single unified key; Blockscout (Chiado) still requires customChains entry.
    apiKey: MULTICHAIN_ETHERSCAN_API_KEY || ETHERSCAN_API_KEY || '',
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
      {
        network: 'gnosis',
        chainId: 100,
        urls: {
          apiURL: 'https://api.gnosisscan.io/api',
          browserURL: 'https://gnosisscan.io',
        },
      },
      {
        network: 'gnosisChiado',
        chainId: 10200,
        urls: {
          apiURL: 'https://gnosis-chiado.blockscout.com/api',
          browserURL: 'https://gnosis-chiado.blockscout.com',
        },
      },
    ],
  },
  defender: {
    apiKey: DEFENDER_API_KEY || '',
    apiSecret: DEFENDER_SECRET || '',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
