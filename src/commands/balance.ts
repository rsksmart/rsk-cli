import ViemProvider from "../utils/viemProvider.js";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { Address, isAddress } from "viem";
const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

export async function balanceCommand(testnet: boolean, address?: Address) {
  try {
    let targetAddress: Address;

    if (address) {
      if (!isAddress(address)) {
        console.log(chalk.red("🚫 Invalid address provided"));
        return;
      }
      targetAddress = address;
    } else {
      if (!fs.existsSync(walletFilePath)) {
        console.log(chalk.red("🚫 No saved wallet found"));
        return;
      }
      const { address: savedAddress } = JSON.parse(
        fs.readFileSync(walletFilePath, "utf8")
      );
      if (!savedAddress) {
        console.log(chalk.red("⚠️ Invalid wallet data"));
        return;
      }
      targetAddress = savedAddress;
    }

    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const balance = await client.getBalance({ address: targetAddress });

    const rbtcBalance = Number(balance) / 10 ** 18;

    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(targetAddress));
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
