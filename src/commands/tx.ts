import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";
import { MonitorManager } from "../utils/monitoring/MonitorManager.js";

export async function txCommand(
  testnet: boolean, 
  txid: string, 
  monitor: boolean = false,
  confirmations: number = 12
): Promise<void> {
  try {
    const formattedTxId = txid.startsWith("0x") ? txid : `0x${txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;

    if (!txidWithCorrectType.startsWith('0x') || txidWithCorrectType.length !== 66) {
      console.error(chalk.red('❌ Invalid transaction hash format.'));
      console.log(chalk.gray('Expected: 64 hex characters with 0x prefix (e.g., 0x1234...)'));
      console.log(chalk.gray(`Received: ${txidWithCorrectType} (length: ${txidWithCorrectType.length})`));
      return;
    }

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

    // If monitoring is requested, start monitoring the transaction
    if (monitor) {
      console.log(chalk.blue(`\n🔍 Starting transaction monitoring...`));
      console.log(chalk.gray(`Network: ${testnet ? 'Testnet' : 'Mainnet'}`));
      console.log(chalk.gray(`Transaction: ${txidWithCorrectType}`));
      console.log(chalk.gray(`Required confirmations: ${confirmations}`));
      console.log('');

      const monitorManager = new MonitorManager(testnet);
      await monitorManager.initialize();

      const sessionId = await monitorManager.startTransactionMonitoring(
        txidWithCorrectType,
        confirmations,
        testnet
      );

      console.log(chalk.green(`\n🎯 Monitoring started successfully!`));
      console.log(chalk.blue(`Press Ctrl+C to stop monitoring`));
      console.log('');

      process.on('SIGINT', async () => {
        console.log(chalk.yellow(`\n⏹️  Stopping monitoring...`));
        await monitorManager.stopMonitoring(sessionId);
        process.exit(0);
      });

      setInterval(() => {}, 1000);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error checking transaction status:'), chalk.yellow(`Error checking transaction status: Invalid transaction hash`));
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
