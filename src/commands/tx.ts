import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";
import { DataTx, TxResult } from "../utils/types.js";

export async function txCommand(
  testnet: boolean,
  txid: string,
  _isExternal?: boolean
): Promise<TxResult | void> {
  try {
    const formattedTxId = txid.startsWith("0x") ? txid : `0x${txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;
    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const txReceipt = await client.getTransactionReceipt({
      hash: txidWithCorrectType,
    });

    if (!txReceipt) {
      const errorMessage = "Transaction not found. Please check the transaction ID and try again.";
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

    const txData : DataTx = {
      txId: txidWithCorrectType,
      blockHash: txReceipt.blockHash,
      blockNumber: txReceipt.blockNumber.toString(),
      gasUsed: txReceipt.gasUsed.toString(),
      status: txReceipt.status ? "Success" as const : "Failed" as const,
      from: txReceipt.from,
      to: txReceipt.to,
      network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
    };

    if (_isExternal) {
      return {
        success: true,
        data: txData,
      };
    } else {
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
  } catch (error) {
    if (_isExternal) {
      if (error instanceof Error) {
        return {
          error: `Error checking transaction status: ${error.message}`,
          success: false,
        };
      } else {
        return {
          error: "An unknown error occurred while checking transaction status.",
          success: false,
        };
      }
    } else {
      if (error instanceof Error) {
        console.error(chalk.red('🚨 Error checking transaction status:'), chalk.yellow(`Error checking transaction status: Invalid transaction hash`));
      } else {
        console.error(chalk.red("🚨 An unknown error occurred."));
      }
    }
  }
}
