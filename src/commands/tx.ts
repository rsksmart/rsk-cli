import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";

export async function txCommand(testnet: boolean, txid: string): Promise<void> {
  try {
    const formattedTxId = txid.startsWith("0x") ? txid : `0x${txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;
    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const txReceipt = await client.getTransactionReceipt({
      hash: txidWithCorrectType,
    });

    if (!txReceipt) {
      console.log(
        chalk.red(
          "⚠️ Transaction not found. Please check the transaction ID and try again."
        )
      );
      return;
    }

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
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error checking transaction status:'), chalk.yellow(`Error checking transaction status: Invalid transaction hash`));
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
