import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { Address } from "viem";

const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

export async function transferCommand(
  testnet: boolean,
  toAddress: Address,
  value: number
) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(
        chalk.red("🚫 No saved wallet found. Please create a wallet first.")
      );
      return;
    }

    const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    const { address: walletAddress } = walletData;

    if (!walletAddress) {
      console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
      return;
    }

    const provider = new ViemProvider(testnet);

    const publicClient = await provider.getPublicClient();
    const balance = await publicClient.getBalance({ address: walletAddress });

    const rbtcBalance = Number(balance) / 10 ** 18;

    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(walletAddress));
    console.log(chalk.white(`🎯 Recipient Address:`), chalk.green(toAddress));
    console.log(
      chalk.white(`💵 Amount to Transfer:`),
      chalk.green(`${value} RBTC`)
    );
    console.log(
      chalk.white(`💰 Current Balance:`),
      chalk.green(`${rbtcBalance} RBTC`)
    );

    if (rbtcBalance < value) {
      console.log(
        chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`)
      );
      return;
    }

    const walletClient = await provider.getWalletClient();

    const account = walletClient.account;
    if (!account) {
      console.log(
        chalk.red(
          "⚠️ Failed to retrieve the account. Please ensure your wallet is correctly set up."
        )
      );
      return;
    }

    const txHash = await walletClient.sendTransaction({
      account: account,
      chain: provider.chain,
      to: toAddress,
      value: BigInt(value * 10 ** 18),
    });

    console.log(
      chalk.white(`🔄 Transaction initiated. TxHash:`),
      chalk.green(txHash)
    );
    const spinner = ora("⏳ Waiting for confirmation...").start();

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    spinner.stop();

    if (receipt.status === "success") {
      console.log(chalk.green("✅ Transaction confirmed successfully!"));
      console.log(
        chalk.white(`📦 Block Number:`),
        chalk.green(receipt.blockNumber)
      );
      console.log(
        chalk.white(`⛽ Gas Used:`),
        chalk.green(receipt.gasUsed.toString())
      );

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
        : `https://explorer.rootstock.io/tx/${txHash}`;
      console.log(
        chalk.white(`🔗 View on Explorer:`),
        chalk.dim(`${explorerUrl}`)
      );
    } else {
      console.log(chalk.red("❌ Transaction failed."));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        chalk.red("🚨 Error during transfer:"),
        chalk.yellow(error.message)
      );
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
