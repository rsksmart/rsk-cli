import fs from "fs";
import chalk from "chalk";
import ora from "ora";
import readline from "readline";
import ViemProvider from "../utils/viemProvider.js";
import { Address } from "viem";
import { FileTx } from "../utils/types.js";

export async function batchTransferCommand(
  filePath?: string,
  testnet: boolean = false,
  interactive: boolean = false
) {
  try {
    let batchData: { to: Address; value: number }[] = [];

    if (interactive) {
      batchData = await promptForTransactions();
    } else if (filePath) {
      if (!fs.existsSync(filePath)) {
        console.log(
          chalk.red("🚫 Batch file not found. Please provide a valid file.")
        );
        return;
      }
      const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
      batchData = fileContent.map((tx: FileTx) => ({
        to: validateAddress(tx.to),
        value: tx.value,
      }));
    } else {
      console.log(
        chalk.yellow(
          "⚠️ No transactions file provided nor interactive mode enabled. Exiting..."
        )
      );
      return;
    }

    if (batchData.length === 0) {
      console.log(chalk.red("⚠️ No transactions file provided. Exiting..."));
      return;
    }

    const provider = new ViemProvider(testnet);
    const walletClient = await provider.getWalletClient();
    const account = walletClient.account;

    if (!account) {
      console.log(
        chalk.red("🚫 Failed to retrieve wallet account. Exiting...")
      );
      return;
    }

    const publicClient = await provider.getPublicClient();
    const balance = await publicClient.getBalance({
      address: account.address,
    });
    const rbtcBalance = Number(balance) / 10 ** 18;

    console.log(
      chalk.white(`📄 Wallet Address:`),
      chalk.green(account.address)
    );
    console.log(
      chalk.white(`💰 Current Balance:`),
      chalk.green(`${rbtcBalance} RBTC`)
    );

    for (const { to, value } of batchData) {
      if (rbtcBalance < value) {
        console.log(
          chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`)
        );
        break;
      }

      const txHash = await walletClient.sendTransaction({
        account,
        chain: provider.chain,
        to,
        value: BigInt(Math.floor(value * 10 ** 18)),
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
      } else {
        console.log(chalk.red("❌ Transaction failed."));
      }
    }
  } catch (error: any) {
    console.error(
      chalk.red("🚨 Error during batch transfer:"),
      chalk.yellow(error.message || "Unknown error")
    );
  }
}

async function promptForTransactions() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const transactions: { to: Address; value: number }[] = [];

  while (true) {
    const to = validateAddress(await askQuestion(rl, "Enter address: "));
    const value = parseFloat(await askQuestion(rl, "Enter amount: "));

    if (isNaN(value)) {
      console.log(chalk.red("⚠️ Invalid amount. Please try again."));
      continue;
    }

    transactions.push({ to, value });

    const addAnother = await askQuestion(
      rl,
      "Add another transaction? (y/n): "
    );
    if (addAnother.toLowerCase() !== "y") break;
  }

  rl.close();
  return transactions;
}

function validateAddress(address: string): Address {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return address as Address;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function askQuestion(
  rl: readline.Interface,
  question: string
): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}
