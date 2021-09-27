require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const LedgerWalletProvider = require('@umaprotocol/truffle-ledger-provider');
const ROPSTEN_MNEMONIC = process.env.ROPSTEN_MNEMONIC;
const API_URL = process.env.API_URL;

module.exports = {
  networks: {
    ganacheDesktop: {
      host: '127.0.0.1', // Localhost (default: none)
      port: 7545, // Standard Ethereum port (default: none)
      network_id: '*', // Any network (default: none)
    },
    ganacheCli: {
      host: '127.0.0.1', // Localhost (default: none)
      port: 8545, // Standard Ethereum port (default: none)
      network_id: '*', // Any network (default: none)
    },
    ropsten: {
      provider: function () {
        return new HDWalletProvider(ROPSTEN_MNEMONIC, API_URL);
      },
      network_id: '3',
      gas: 3220037, //4M is the max
    },
    hardsten: {
      provider: function () {
        const ledgerOptions = {}; // use default options
        return new LedgerWalletProvider(ledgerOptions, API_URL);
      },
      network_id: '3',
      gas: 3220037, //4M is the max
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: '0.8.0', // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: false,
          runs: 200,
        },
        evmVersion: 'byzantium',
      },
    },
  },
};
