import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  getTokenInfo,
  isERC20Contract,
  resolveTokenAddress,
} from "../utils/tokenHelper.js";
import ora from "ora";
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

export async function balanceCommand(
  testnet: boolean,
  walletName: string,
  holderAddress?: Address,
  _isExternal?: boolean,
  _token?: string,
  _customTokenAddress?: Address,
  _walletsData?: WalletData,
): Promise<BalanceResult | void> {
  const spinner = _isExternal ? ora({isEnabled: false}) : ora();

  try {
    const walletsData = _isExternal && _walletsData ? _walletsData : JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.log(chalk.red(`⚠️ ${errorMessage}`));
        throw new Error(errorMessage);
      }
    }

    const { currentWallet, wallets } = walletsData;
    let wallet = wallets[currentWallet];

    if (walletName) {
      if (!wallets[walletName]) {
        const errorMessage = "Wallet with the provided name does not exist.";
        if (_isExternal) {
          return {
            error: errorMessage,
            success: false,
          };
        } else {
          console.log(chalk.red(`⚠️ ${errorMessage}`));
          return;
        }
      } else {
        wallet = wallets[walletName];
      }
    }

    const { address } = wallet;

    if (!address) {
      const errorMessage = "No valid address found in the saved wallet.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.log(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    const targetAddress = getAddress(address);

    if (!targetAddress) {
      const errorMessage = "Invalid address format.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.log(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    let token: string;
    
    if (_isExternal && _token) {
      token = _token;
    } else if (_isExternal && !_token) {
      return {
        error: "Token parameter is required when using external mode.",
        success: false,
      };
    } else {
      const { token: selectedToken } = await inquirer.prompt({
        type: "list",
        name: "token",
        message: "Select token to check balance:",
        choices: ["rBTC", ...Object.keys(TOKENS), "Custom Token"],
      });
      token = selectedToken;
    }

    if (token === "rBTC") {
      if (!_isExternal) {
        spinner.start(chalk.white("🔍 Checking balance..."));
      }
      
      const balance = await client.getBalance({ address: targetAddress });
      const rbtcBalance = formatUnits(balance, 18);

      if (!_isExternal) {
        spinner.succeed(chalk.green("Balance retrieved successfully"));

        console.log(
          chalk.white(`📄 Wallet Address:`),
          chalk.green(targetAddress)
        );
        console.log(
          chalk.white(`🌐 Network:`),
          chalk.green(testnet ? "Rootstock Testnet" : "Rootstock Mainnet")
        );
        console.log(
          chalk.white(`💰 Current Balance:`),
          chalk.green(`${rbtcBalance} RBTC`)
        );
        console.log(
          chalk.blue(
            `🔗 Ensure that transactions are being conducted on the correct network.`
          )
        );
        return;
      } else {
        return {
          success: true,
          data: {
            walletAddress: targetAddress,
            network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            balance: rbtcBalance,
            symbol: "RBTC",
            tokenType: "native",
          },
        };
      }
    }

    let tokenAddress: Address;

    if (token === "Custom Token") {
      if (_isExternal && _customTokenAddress) {
        const formattedContractAddress = validateAndFormatAddress(_customTokenAddress);
        if (!formattedContractAddress) {
          return {
            error: "Invalid custom token address provided.",
            success: false,
          };
        }
        if (!(await isValidContract(client, formattedContractAddress))) {
          return {
            error: "Invalid contract address or contract not found.",
            success: false,
          };
        }
        if (!(await isERC20Contract(client, formattedContractAddress))) {
          return {
            error: "Invalid contract address, only ERC20 tokens are supported.",
            success: false,
          };
        }
        tokenAddress = _customTokenAddress.toLowerCase() as Address;
      } else if (_isExternal && !_customTokenAddress) {
        return {
          error: "Custom token address is required when using Custom Token in external mode.",
          success: false,
        };
      } else {
        if (!_isExternal) {
          spinner.stop();
        }
        const { address } = await inquirer.prompt({
          type: "input",
          name: "address",
          message: "Enter the token address:",
          validate: async (input: string) => {
            try {
              const address = input as Address;
              const formattedContractAddress = validateAndFormatAddress(address);
              if (!formattedContractAddress) {
                console.log(chalk.red());
                return "🚫 Invalid contract address";
              }
              if (!(await isValidContract(client, formattedContractAddress))) {
                return "🚫 Invalid contract address or contract not found";
              }
              if (!(await isERC20Contract(client, formattedContractAddress))) {
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
      tokenAddress = resolveTokenAddress(token, testnet);
    }

    if (!_isExternal) {
      spinner.start(chalk.white("🔍 Checking balance..."));
    }

    const { balance, decimals, name, symbol } = await getTokenInfo(
      client,
      tokenAddress,
      targetAddress
    );
    const formattedBalance = formatUnits(balance, decimals);

    if (!_isExternal) {
      spinner.succeed(chalk.green("Balance retrieved successfully"));

      console.log(
        chalk.white(`📄 Token Information:
       Name: ${chalk.green(name)}
       Contract: ${chalk.green(tokenAddress)}
    👤 Holder Address: ${chalk.green(targetAddress)}
    💰 Balance: ${chalk.green(`${formattedBalance} ${symbol}`)}
    🌐 Network: ${chalk.green(
      testnet ? "Rootstock Testnet" : "Rootstock Mainnet"
    )}`)
      );

      console.log(
        chalk.blue(
          `🔗 Ensure that transactions are being conducted on the correct network.`
        )
      );
    } else {
      return {
        success: true,
        data: {
          walletAddress: targetAddress,
          network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
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
    if (_isExternal) {
      if (error instanceof Error) {
        return {
          error: `Error checking balance: ${error.message}`,
          success: false,
        };
      } else {
        return {
          error: "An unknown error occurred while checking balance.",
          success: false,
        };
      }
    } else {
      if (error instanceof Error) {
        console.error(
          chalk.red("🚨 Error checking balance:"),
          chalk.yellow(error.message)
        );
      } else {
        console.error(chalk.red("🚨 An unknown error occurred."));
      }
    }
  } finally {
    if (!_isExternal) {
      spinner.stop();
    }
  }
}
