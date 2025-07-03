import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import inquirer from "inquirer";
import {
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
import { TokenStandard, getTokenInfo as getTokenInfoStandard, getERC721TokenIds, detectTokenStandard } from "../utils/tokenStandards.js";

export async function balanceCommand(
  testnet: boolean,
  walletName: string,
  holderAddress?: Address
) {
  const spinner = ora();

  try {
    let targetAddress: Address;

    if (holderAddress) {
      // Validate the provided address
      const formattedAddress = validateAndFormatAddress(holderAddress);
      if (!formattedAddress) {
        console.log(chalk.red("⚠️ Invalid address provided."));
        return;
      }
      targetAddress = formattedAddress;
    } else {
      // Use wallet address logic
      const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

      if (!walletsData.currentWallet || !walletsData.wallets) {
        console.log(
          chalk.red(
            "⚠️ No valid wallet found. Please create or import a wallet first."
          )
        );
        throw new Error();
      }

      const { currentWallet, wallets } = walletsData;
      let wallet = wallets[currentWallet];

      if (walletName) {
        if (!wallets[walletName]) {
          console.log(
            chalk.red("⚠️ Wallet with the provided name does not exist.")
          );
          return;
        } else {
          wallet = wallets[walletName];
        }
      }

      const { address } = wallet;

      if (!address) {
        console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
        return;
      }

      const addressResult = getAddress(address);
      if (!addressResult) {
        return;
      }
      targetAddress = addressResult;
    }

    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const { token } = await inquirer.prompt({
      type: "list",
      name: "token",
      message: "Select token to check balance:",
      choices: ["rBTC", ...Object.keys(TOKENS), "Custom Token"],
    });

    if (token === "rBTC") {
      spinner.start(chalk.white("🔍 Checking balance..."));
      const balance = await client.getBalance({ address: targetAddress });
      const rbtcBalance = formatUnits(balance, 18);

      spinner.succeed(chalk.green("Balance retrieved successfully"));

      console.log(
        chalk.white(`📄 Address:`),
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
    }

    let tokenAddress: Address;

    if (token === "Custom Token") {
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
              console.log(chalk.red());
              return "🚫 Invalid contract address";
            }
            if (!(await isValidContract(client, formattedContractAddress))) {
              return "🚫 Invalid contract address or contract not found";
            }
            const standard = await detectTokenStandard(client, formattedContractAddress);
            if (standard !== TokenStandard.ERC20 && standard !== TokenStandard.ERC721) {
              return "🚫 Invalid contract address, only ERC20 or ERC721 tokens are supported";
            }
            return true;
          } catch {
            return false;
          }
        },
      });
      tokenAddress = address.toLowerCase() as Address;
    } else {
      tokenAddress = resolveTokenAddress(token, testnet);
    }

    spinner.start(chalk.white("🔍 Checking balance..."));

    const { balance, decimals, name, symbol, standard } = await getTokenInfoStandard(
      client,
      tokenAddress,
      targetAddress
    );
    const formattedBalance = formatUnits(balance, decimals ?? 18);

    if (standard === TokenStandard.ERC721) {
      const tokenIds = await getERC721TokenIds(client, tokenAddress, targetAddress);
      spinner.succeed(chalk.green("NFTs retrieved successfully"));
      console.log(
        chalk.white(`📄 Token Information:\n     Name: ${chalk.green(name)}\n     Contract: ${chalk.green(tokenAddress)}\n  👤 Holder Address: ${chalk.green(targetAddress)}\n  🖼️ Owned Token IDs: ${chalk.green(tokenIds.length > 0 ? tokenIds.join(", ") : "None")}\n  🌐 Network: ${chalk.green(testnet ? "Rootstock Testnet" : "Rootstock Mainnet")}`)
      );
      return;
    }

    spinner.succeed(chalk.green("Balance retrieved successfully"));

    console.log(
      chalk.white(`📄 Token Information:\n     Name: ${chalk.green(name)}\n     Contract: ${chalk.green(tokenAddress)}\n  👤 Holder Address: ${chalk.green(targetAddress)}\n  💰 Current Balance: ${chalk.green(formattedBalance)} ${symbol}\n  🌐 Network: ${chalk.green(testnet ? "Rootstock Testnet" : "Rootstock Mainnet")}`)
    );
  } catch (error) {
    console.error(chalk.red("An error occurred: "), error);
  }
}
