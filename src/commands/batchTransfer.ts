import fs from "fs";
import chalk from "chalk";
import readline from "readline";
import ViemProvider from "../utils/viemProvider.js";
import { Address } from "viem";
import { FileTx, WalletData } from "../utils/types.js";
import { resolveRNSToAddress, isRNSDomain } from "../utils/rnsHelper.js";
import { validateAndFormatAddressRSK } from "../utils/index.js";
import { TransferAttestationData } from "../utils/attestation.js";
import { handleAttestation } from "../utils/attestationHandler.js";
import { getCurrentTimestamp } from "../utils/constants.js";
import { logError, logSuccess, logInfo, logMessage } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type BatchTransferCommandOptions = {
  testnet: boolean;
  interactive: boolean;
  filePath?: string;
  isExternal?: boolean;
  batchData?: BatchData[];
  name?: string;
  password?: string;
  walletsData?: WalletData;
  resolveRNS?: boolean;
  attestation?: {
    enabled: boolean;
    schemaUID?: string;
    recipient?: string;
    reason?: string;
  };
};

type BatchData = {
  to: Address | string;
  value: number;
};


export async function batchTransferCommand(params: BatchTransferCommandOptions) {
  const isExternal = params.isExternal || false;

  try {
    const batchData = await getBatchData(params);

    if (batchData.length === 0) {
      const errorMessage = "No transactions file provided. Exiting...";
      logError(isExternal, `❌ ${errorMessage}`);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const provider = new ViemProvider(params.testnet);

    let walletClient;
    let walletPassword: string | undefined;
    let walletsData: any;
    let walletName: string | undefined;

    if (isExternal) {
      if (!params.name || !params.password || !params.walletsData) {
        const errorMessage = "Wallet name, password and wallets data are required.";
        logError(isExternal, `❌ ${errorMessage}`);
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
      walletPassword = params.password;
      walletsData = params.walletsData;
      walletName = params.name;
    } else {
      const { client, password, data, name } = await provider.getWalletClientWithPassword(params.name);
      walletClient = client;
      walletPassword = password;
      walletsData = data;
      walletName = name;
    }
    if (!walletClient) {
      const errorMessage = "Failed to get wallet client.";
      logError(isExternal, `❌ ${errorMessage}`);
      return {
        error: errorMessage,
        success: false,
      };
    }
    const account = walletClient.account;

    if (!account) {
      const errorMessage = "Failed to retrieve wallet account. Exiting...";
      logError(isExternal, `❌ ${errorMessage}`);
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

    logMessage(isExternal, `📄 Wallet Address: ${account.address}`, chalk.white);
    logMessage(isExternal, `💰 Current Balance: ${rbtcBalance} RBTC`, chalk.white);

    for (const { to, value } of batchData) {
      if (rbtcBalance < value) {
        const errorMessage = `Insufficient balance to transfer ${value} RBTC.`;
        logError(isExternal, `❌ ${errorMessage}`);
        return {
          error: errorMessage,
          success: false,
        };
      }

      let recipientAddress: Address;
      if (params.resolveRNS && isRNSDomain(to)) {
        logMessage(isExternal, `🔍 Resolving RNS domain: ${to}`, chalk.white);
        const resolved = await resolveRNSToAddress({
          name: to,
          testnet: params.testnet,
          isExternal: params.isExternal
        });
        if (!resolved) {
          logError(isExternal, `Failed to resolve RNS domain: ${to}. Skipping transaction.`);
          continue;
        }
        const formatted = validateAndFormatAddressRSK(resolved as string, params.testnet);
        if (!formatted) {
          logError(isExternal, `Resolved address is invalid for: ${to}. Skipping transaction.`);
          continue;
        }
        recipientAddress = formatted as Address;
      } else {
        recipientAddress = validateAddress(to as string, params.testnet);
      }

      const txHash = await walletClient.sendTransaction({
        account,
        chain: provider.chain,
        to: recipientAddress,
        value: BigInt(Math.floor(value * 10 ** 18)),
      });

      logMessage(isExternal, `🔄 Transaction initiated. TxHash: ${txHash}`, chalk.white);

      const spinner = createSpinner(isExternal);
      spinner.start("⏳ Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      spinner.stop();

      if (receipt.status === "success") {
        logSuccess(isExternal, "✅ Transaction confirmed successfully!");
        logInfo(isExternal, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(isExternal, `⛽ Gas Used: ${receipt.gasUsed.toString()}`);

        let attestationUID: string | null = null;
        if (params.attestation?.enabled) {
          const attestationData: TransferAttestationData = {
            sender: account.address,
            recipient: recipientAddress,
            amount: `${value}`,
            tokenAddress: undefined,
            tokenSymbol: "RBTC",
            transactionHash: txHash,
            blockNumber: Number(receipt.blockNumber),
            timestamp: getCurrentTimestamp(),
            reason: params.attestation.reason || "",
            transferType: "RBTC"
          };

          const result = await handleAttestation('transfer', attestationData, {
            enabled: params.attestation.enabled,
            testnet: params.testnet,
            schemaUID: params.attestation.schemaUID,
            recipient: params.attestation.recipient || recipientAddress,
            isExternal: params.isExternal,
            walletName: walletName,
            walletsData: walletsData,
            password: walletPassword
          });

          attestationUID = result.uid;
        }

        return {
          success: true,
          data: {
            transactionHash: txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            attestationUID: attestationUID || undefined,
          },
        };
      } else {
        logError(isExternal, "Transaction failed.");
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
    logError(isExternal, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}

async function promptForTransactions(allowRNS: boolean = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const transactions: { to: Address | string; value: number }[] = [];

  while (true) {
    const prompt = allowRNS 
      ? "Enter address or RNS domain (e.g., alice.rsk): "
      : "Enter address: ";
    const input = await askQuestion(rl, prompt);
    
    let to: Address | string;
    if (allowRNS && isRNSDomain(input)) {
      to = input;
    } else {
      try {
        to = validateAddress(input);
      } catch (error) {
        logError(false, "⚠️ Invalid address. Please try again.");
        continue;
      }
    }

    const value = parseFloat(await askQuestion(rl, "Enter amount: "));

    if (isNaN(value)) {
      logError(false, "⚠️ Invalid amount. Please try again.");
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

function validateAddress(address: string, testnet?: boolean): Address {
  const formatted = validateAndFormatAddressRSK(address, !!testnet);
  if (!formatted) {
    throw new Error(`Invalid address: ${address}`);
  }
  return formatted as Address;
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
      return await promptForTransactions(params.resolveRNS);
    } else if (params.filePath) {
      if (!fs.existsSync(params.filePath)) {
        logError(false, "🚫 Batch file not found. Please provide a valid file.");
        return [];
      }
      const fileContent = JSON.parse(fs.readFileSync(params.filePath, "utf8"));
      batchData = fileContent.map((tx: FileTx) => ({
        to: tx.to,
        value: tx.value,
      }));
      return batchData;
    } else {
      logError(false, "⚠️ No transactions file provided nor interactive mode enabled. Exiting...");
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
