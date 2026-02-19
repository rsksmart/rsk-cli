import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  getTokenInfo,
  isERC20Contract,
  resolveTokenAddress,
} from "../utils/tokenHelper.js";
import {
  getAddress,
  isValidContract,
  validateAndFormatAddress,
} from "../utils/index.js";
import { Address, formatUnits } from "viem";
import { TOKENS } from "../constants/tokenAdress.js";
import fs from "fs";
import { walletFilePath } from "../utils/constants.js";
import { WalletData } from "../utils/types.js";
import { getConfig } from "./config.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type BalanceCommandOptions = {
  testnet?: boolean;
  walletName?: string;
  address?: Address;
  isExternal?: boolean;
  token?: string;
  customTokenAddress?: Address;
  walletsData?: WalletData;
};

type BalanceResult = {
  success: boolean;
  data?: {
    walletAddress: string;
    network: string;
    balance: string;
    symbol: string;
    tokenType: "native" | "erc20";
    tokenName?: string;
    tokenSymbol?: string;
    tokenContract?: string;
    decimals?: number;
  };
  error?: string;
};

export async function balanceCommand(params: BalanceCommandOptions): Promise<BalanceResult | void> {
  const config = getConfig();
  const isTestnet = params.testnet !== undefined ? params.testnet : (config.defaultNetwork === 'testnet');

  const spinner = createSpinner(params.isExternal || false);

  try {
    let targetAddress: Address | undefined;

    if (params.address) {
      targetAddress = getAddress(params.address);
    } else {
      const walletsData = params.isExternal && params.walletsData
        ? params.walletsData
        : JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

      if (!walletsData.currentWallet || !walletsData.wallets) {
        const errorMessage = "No valid wallet found. Please create or import a wallet first.";
        logError(params.isExternal || false, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const { currentWallet, wallets } = walletsData;
      let wallet = wallets[currentWallet];

      if (params.walletName) {
        if (!wallets[params.walletName]) {
          const errorMessage = "Wallet with the provided name does not exist.";
          logError(params.isExternal || false, errorMessage);
          return {
            error: errorMessage,
            success: false,
          };
        } else {
          wallet = wallets[params.walletName];
        }
      }

      const address = wallet.address;
      if (!address) {
        const errorMessage = "No valid address found in the saved wallet.";
        logError(params.isExternal || false, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
      targetAddress = getAddress(address);
    }

    if (!targetAddress) {
      const errorMessage = "Invalid address format.";
      logError(params.isExternal || false, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const provider = new ViemProvider(isTestnet);
    const client = await provider.getPublicClient();

    let token: string;
    if (params.token) {
      token = params.token;
    } else if (params.isExternal) {
      return {
        error: "Token parameter is required when using external mode.",
        success: false,
      };
    } else {
      try {
        const { token: selectedToken } = await inquirer.prompt({
          type: "list",
          name: "token",
          message: "Select token to check balance:",
          choices: ["rBTC", ...Object.keys(TOKENS), "Custom Token"],
        });
        token = selectedToken;
      } catch {
        token = "rBTC";
      }
    }

    if (token === "rBTC") {
      spinner.start(`⏳ Checking balance...`);

      const balance = await client.getBalance({ address: targetAddress });
      const rbtcBalance = formatUnits(balance, 18);

      spinner.succeed(chalk.white("Balance retrieved successfully"));
      if (config.displayPreferences.compactMode) {
        logSuccess(params.isExternal || false, `${targetAddress}: ${rbtcBalance} RBTC`);
      } else {
        logSuccess(params.isExternal || false, `📄 Wallet Address: ${targetAddress}`);
        logSuccess(params.isExternal || false, `🌐 Network: ${isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet"}`);
        logSuccess(params.isExternal || false, `💰 Current Balance: ${rbtcBalance} RBTC`);
        logInfo(params.isExternal || false, "🔗 Ensure that transactions are being conducted on the correct network.");
      }
      
      return {
        success: true,
        data: {
          walletAddress: targetAddress,
          network: isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          balance: rbtcBalance,
          symbol: "RBTC",
          tokenType: "native",
        },
      };
    }

    let tokenAddress: Address;

    if (token === "Custom Token") {
      if (params.isExternal && params.customTokenAddress) {
        const formattedContractAddress = validateAndFormatAddress(params.customTokenAddress);
        if (!formattedContractAddress) {
          return { error: "Invalid custom token address provided.", success: false };
        }
        if (!(await isValidContract(client, formattedContractAddress))) {
          return { error: "Invalid contract address or contract not found.", success: false };
        }
        if (!(await isERC20Contract(client, formattedContractAddress))) {
          return { error: "Invalid contract address, only ERC20 tokens are supported.", success: false };
        }
        tokenAddress = params.customTokenAddress.toLowerCase() as Address;
      } else if (params.isExternal && !params.customTokenAddress) {
        return { error: "Custom token address is required when using Custom Token in external mode.", success: false };
      } else {
        spinner.stop();
        const { address } = await inquirer.prompt({
          type: "input",
          name: "address",
          message: "Enter the token address:",
          validate: async (input: string) => {
            try {
              const address = input as Address;
              const formattedContractAddress = validateAndFormatAddress(address);
              if (!formattedContractAddress) {
                logError(params.isExternal || false, "Invalid contract address");
                return "🚫 Invalid contract address";
              }
              if (!(await isValidContract(client, formattedContractAddress))) {
                logError(params.isExternal || false, "Invalid contract address or contract not found");
                return "🚫 Invalid contract address or contract not found";
              }
              if (!(await isERC20Contract(client, formattedContractAddress))) {
                logError(params.isExternal || false, "Invalid contract address, only ERC20 tokens are supported");
                return "🚫 Invalid contract address, only ERC20 tokens are supported";
              }
              return true;
            } catch {
              return false;
            }
          },
        });
        tokenAddress = address.toLowerCase() as Address;
      }
    } else {
      tokenAddress = resolveTokenAddress(token, isTestnet);
    }

    spinner.start(`⏳ Checking balance...`);

    const { balance, decimals, name, symbol } = await getTokenInfo(
      client,
      tokenAddress,
      targetAddress
    );
    const formattedBalance = formatUnits(balance, decimals);

    spinner.succeed(chalk.white("Balance retrieved successfully"));


    if (config.displayPreferences.compactMode) {
      logSuccess(params.isExternal || false, `${targetAddress}: ${formattedBalance} ${symbol}`);
    } else {
      logSuccess(params.isExternal || false, `📄 Token Information:
         Name: ${name}
         Contract: ${tokenAddress}
      👤 Holder Address: ${targetAddress}
      💰 Balance: ${formattedBalance} ${symbol}
      🌐 Network: ${isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet"}`);

      logInfo(params.isExternal || false, "🔗 Ensure that transactions are being conducted on the correct network.");
    }
    
    if (params.isExternal) {
      return {
        success: true,
        data: {
          walletAddress: targetAddress,
          network: isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          balance: formattedBalance,
          symbol: symbol,
          tokenType: "erc20",
          tokenName: name,
          tokenSymbol: symbol,
          tokenContract: tokenAddress,
          decimals: decimals,
        },
      };
    }
  } catch (error) {
    const errorMessage = "Error checking balance, please check the token address.";
    logError(params.isExternal || false, errorMessage);
    
    return { error: errorMessage, success: false };
  } finally {
    if (!params.isExternal) {
      spinner.stop();
    }
  }
}