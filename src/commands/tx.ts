import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";
import { DataTx, TxResult } from "../utils/types.js";

type TxCommandOptions = {
  testnet: boolean;
  txid: string;
  isExternal?: boolean;
};

function logMessage(
  params: TxCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: TxCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

export async function txCommand(
  params: TxCommandOptions
): Promise<TxResult | void> {
  try {
    const formattedTxId = params.txid.startsWith("0x") ? params.txid : `0x${params.txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;
    const provider = new ViemProvider(params.testnet);
    const client = await provider.getPublicClient();

    const txReceipt = await client.getTransactionReceipt({
      hash: txidWithCorrectType,
    });

    if (!txReceipt) {
      const errorMessage = "Transaction not found. Please check the transaction ID and try again.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const txData : DataTx = {
      txId: txidWithCorrectType,
      blockHash: txReceipt.blockHash,
      blockNumber: txReceipt.blockNumber.toString(),
      gasUsed: txReceipt.gasUsed.toString(),
      status: txReceipt.status ? "Success" as const : "Failed" as const,
      from: txReceipt.from,
      to: txReceipt.to,
      network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
    };

    if (!params.isExternal) {
      const table = new Table({
        head: ["🔍", "Details"],
        colWidths: [20, 68],
      });

      table.push(
        { "🔑 Tx ID": txidWithCorrectType },
        { "🔗 Block Hash": txReceipt.blockHash },
        { "🧱 Block No.": txReceipt.blockNumber.toString() },
        { "⛽ Gas Used": txReceipt.gasUsed.toString() },
        { "✅ Status": txReceipt.status ? "Success" : "Failed" },
        { "📤 From": txReceipt.from },
        { "📥 To": txReceipt.to }
      );
      console.log(table.toString());
    }

    return {
      success: true,
      data: txData,
    };
  } catch (error) {
    const errorMessage = "Error checking transaction status, please check the transaction ID.";
    
    logError(params, errorMessage);
    
    return {
      error: errorMessage,
      success: false,
    };
  }
}
