import fs from "fs";
import chalk from "chalk";
import ora from "ora";
import { walletFilePath } from "../utils/constants.js";
import ViemProvider from "../utils/viemProvider.js";

export async function batchTransferCommand(filePath: string, testnet: boolean) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red("🚫 Batch file not found. Please provide a valid file."));
      return;
    }

    const batchData = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (!Array.isArray(batchData) || batchData.length === 0) {
      console.log(chalk.red("⚠️ Invalid batch data. Please check the file content."));
      return;
    }

    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    if (!walletsData.currentWallet || !walletsData.wallets) {
      console.log(chalk.red("⚠️ No valid wallet found. Please create or import a wallet first."));
      throw new Error();
    }

    const { currentWallet, wallets } = walletsData;
    const wallet = wallets[currentWallet];
    const { address: walletAddress } = wallet;

    if (!walletAddress) {
      console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
      return;
    }

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const balance = await publicClient.getBalance({ address: walletAddress });

    const rbtcBalance = Number(balance) / 10 ** 18;
    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(walletAddress));
    console.log(chalk.white(`💰 Current Balance:`), chalk.green(`${rbtcBalance} RBTC`));

    for (const transfer of batchData) {
      const { to, value } = transfer;
      if (!to || !value) {
        console.log(chalk.red("⚠️ Invalid transaction data in batch. Skipping..."));
        continue;
      }

      if (rbtcBalance < value) {
        console.log(chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`));
        break;
      }

      const walletClient = await provider.getWalletClient();
      const account = walletClient.account;
      if (!account) {
        console.log(chalk.red("⚠️ Failed to retrieve the account. Skipping this transaction."));
        continue;
      }

      const txHash = await walletClient.sendTransaction({
        account: account,
        chain: provider.chain,
        to: to,
        value: BigInt(Math.floor(value * 10 ** 18)),
      });

      console.log(chalk.white(`🔄 Transaction initiated. TxHash:`), chalk.green(txHash));

      const spinner = ora("⏳ Waiting for confirmation...").start();

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      spinner.stop();

      if (receipt.status === "success") {
        console.log(chalk.green("✅ Transaction confirmed successfully!"));
        console.log(chalk.white(`📦 Block Number:`), chalk.green(receipt.blockNumber));
        console.log(chalk.white(`⛽ Gas Used:`), chalk.green(receipt.gasUsed.toString()));

        const explorerUrl = testnet
          ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
          : `https://explorer.rootstock.io/tx/${txHash}`;
        console.log(chalk.white(`🔗 View on Explorer:`), chalk.dim(`${explorerUrl}`));
      } else {
        console.log(chalk.red("❌ Transaction failed."));
      }
    }
  } catch (error: any) {
    console.error(chalk.red("🚨 Error during batch transfer:"), chalk.yellow(error.message || "Unknown error"));
  }
}
