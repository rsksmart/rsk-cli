import fs from "fs";
import chalk from "chalk";
import ora from "ora";
import readline from "readline";
import ViemProvider from "../utils/viemProvider.js";
import { Address } from "viem";
import { FileTx, WalletData } from "../utils/types.js";

type BatchTransferCommandOptions = {
  testnet: boolean;
  interactive: boolean;
  filePath?: string;
  isExternal?: boolean;
  batchData?: BatchData[];
  name?: string;
  password?: string;
  walletsData?: WalletData;
};
type BatchData = {
  to: Address;
  value: number;
};

function logMessage(
  params: BatchTransferCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logSuccess(params: BatchTransferCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}
function logError(params: BatchTransferCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}
function logInfo(params: BatchTransferCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: BatchTransferCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: BatchTransferCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

export async function batchTransferCommand(params: BatchTransferCommandOptions) {
  try {
    const batchData = await getBatchData(params);

    if (batchData.length === 0) {
      const errorMessage = "No transactions file provided. Exiting...";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const provider = new ViemProvider(params.testnet);

    let walletClient;
    if (params.isExternal) {
      if (!params.name || !params.password || !params.walletsData) {
        const errorMessage = "Wallet name, password and wallets data are required.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
      walletClient = await provider.getWalletClientExternal(
        params.walletsData,
        params.name,
        params.password,
        provider
      );
    } else {
      walletClient = await provider.getWalletClient();
    }
    if (!walletClient) {
      const errorMessage = "Failed to get wallet client.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
    const account = walletClient.account;

    if (!account) {
      const errorMessage = "Failed to retrieve wallet account. Exiting...";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const publicClient = await provider.getPublicClient();
    const balance = await publicClient.getBalance({
      address: account.address,
    });
    const rbtcBalance = Number(balance) / 10 ** 18;

    logMessage(params, `📄 Wallet Address: ${account.address}`);
    logMessage(params, `💰 Current Balance: ${rbtcBalance} RBTC`);

    for (const { to, value } of batchData) {
      if (rbtcBalance < value) {
        const errorMessage = `Insufficient balance to transfer ${value} RBTC.`;
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const txHash = await walletClient.sendTransaction({
        account,
        chain: provider.chain,
        to,
        value: BigInt(Math.floor(value * 10 ** 18)),
      });

      logMessage(params, `🔄 Transaction initiated. TxHash: ${txHash}`);

      const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
      startSpinner(params, spinner, "⏳ Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      stopSpinner(params, spinner);

      if (receipt.status === "success") {
        logSuccess(params, "✅ Transaction confirmed successfully!");
        logInfo(params, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(params, `⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        return {
          success: true,
          data: {
            transactionHash: txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
          },
        };
      } else {
        logError(params, "❌ Transaction failed.");
        return {
          success: false,
          data: {
            transactionHash: txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
          },
        };
      }
    }
  } catch (error: any) {
    const errorMessage = `🚨 Error during batch transfer: ${error.message || "Unknown error"}`;
    logError(params, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
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

async function getBatchData(params: BatchTransferCommandOptions): Promise<BatchData[] | []> {
  let batchData: BatchData[] | [];

  if (params.isExternal) {
    if (!params.batchData || params.batchData.length <= 0) {
      return [];
    }
    return params.batchData;
  } else {
    if (params.interactive) {
      return await promptForTransactions();;
    } else if (params.filePath) {
      if (!fs.existsSync(params.filePath)) {
        console.log(
          chalk.red("🚫 Batch file not found. Please provide a valid file.")
        );
        return [];
      }
      const fileContent = JSON.parse(fs.readFileSync(params.filePath, "utf8"));
      batchData = fileContent.map((tx: FileTx) => ({
        to: validateAddress(tx.to),
        value: tx.value,
      }));
      return batchData;
    } else {
      console.log(
        chalk.yellow(
          "⚠️ No transactions file provided nor interactive mode enabled. Exiting..."
        )
      );
      return [];
    }
  }
}

function askQuestion(
  rl: readline.Interface,
  question: string
): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}
