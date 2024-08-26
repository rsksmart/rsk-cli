import ViemProvider from "../utils/viemProvider.js";
import fs from "fs";
import path from "path";
import chalk from "chalk";

const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

export async function balanceCommand(testnet: boolean) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(
        chalk.red("🚫 No saved wallet found. Please create a wallet first.")
      );
      return;
    }

    const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    const { address } = walletData;

    if (!address) {
      console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
      return;
    }

    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const balance = await client.getBalance({ address });

    const rbtcBalance = Number(balance) / 10 ** 18;

    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(address));
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
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        chalk.red("🚨 Error checking balance:"),
        chalk.yellow(error.message)
      );
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
