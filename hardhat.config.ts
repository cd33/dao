import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers"
import "hardhat-deploy"
import "hardhat-gas-reporter"
import "@typechain/hardhat"

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer:{
        enabled: true,
        runs: 200,
      }
    }
  }, 
  networks: {
    hardhat: { // tests
      chainId: 31337
    },
    localhost: { // node
      chainId: 31337
    },
  },
  namedAccounts: {
    deployer: {
      default: 0
    }
  },
  gasReporter: {
    enabled: true,
    // currency: "USD",
    // outputFile: "gas-report.txt",
    // noColors: true,
    // coinmarketcap: COINMARKETCAP_API_KEY,
  }
};

export default config;
