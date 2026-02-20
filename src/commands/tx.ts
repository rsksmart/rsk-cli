import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";
import { DataTx, TxResult } from "../utils/types.js";
import { MonitorManager } from "../utils/monitoring/MonitorManager.js";
import { logError, logSuccess, logInfo, logWarning, logMessage } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type TxCommandOptions = {
  testnet: boolean;
  txid: string;
  isExternal?: boolean;
  monitor?: boolean;
  confirmations?: number;
};


export async function txCommand(
  params: TxCommandOptions
): Promise<TxResult | void> {
  const isExternal = params.isExternal || false;

  try {
    const formattedTxId = params.txid.startsWith("0x") ? params.txid : `0x${params.txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;
    const provider = new ViemProvider(params.testnet);
    const client = await provider.getPublicClient();

    const txReceipt = await client.getTransactionReceipt({
      hash: txidWithCorrectType,
    });

    if (!txReceipt) {
      const network = params.testnet ? "testnet" : "mainnet";
      const oppositeNetwork = params.testnet ? "mainnet" : "testnet";
      const errorMessage = `Transaction not found on ${network}. Please check the transaction ID and network. Try with --testnet flag if the transaction is on ${oppositeNetwork}.`;
      logError(isExternal, `❌ ${errorMessage}`);
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

    if (params.monitor) {
      return await handleTransactionMonitoring(params, txidWithCorrectType);
    }

    return {
      success: true,
      data: txData,
    };
  } catch (error) {
    const network = params.testnet ? "testnet" : "mainnet";
    const oppositeNetwork = params.testnet ? "mainnet" : "testnet";
    const errorMessage = `Error checking transaction status on ${network}. Please check the transaction ID and network. Try with --testnet flag if the transaction is on ${oppositeNetwork}.`;

    logError(isExternal, errorMessage);

    return {
      error: errorMessage,
      success: false,
    };
  }
}

async function handleTransactionMonitoring(
  params: TxCommandOptions,
  txHash: `0x${string}`
): Promise<TxResult | void> {
  const isExternal = params.isExternal || false;
  const spinner = createSpinner(isExternal);

  try {
    const confirmations = params.confirmations ?? 12;

    logInfo(isExternal, `🔍 Starting transaction monitoring...`);
    logMessage(isExternal, `Network: ${params.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
    logMessage(isExternal, `Transaction: ${txHash}`, chalk.gray);
    logMessage(isExternal, `Required confirmations: ${confirmations}`, chalk.gray);
    logMessage(isExternal, '', chalk.white);

    spinner.start('⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(params.testnet);
    await monitorManager.initialize();
    spinner.succeed('✅ Monitor initialized successfully');

    spinner.start('⏳ Starting transaction monitoring...');
    const sessionId = await monitorManager.startTransactionMonitoring(
      txHash,
      confirmations,
      params.testnet
    );
    spinner.succeed('✅ Transaction monitoring started successfully');

    logSuccess(isExternal, `\n🎯 Monitoring started successfully!`);
    logInfo(isExternal, `Press Ctrl+C to stop monitoring`);
    logMessage(isExternal, '', chalk.white);

    process.on('SIGINT', async () => {
      logWarning(isExternal, `\n⏹️  Stopping monitoring...`);
      await monitorManager.stopMonitoring(sessionId);
      process.exit(0);
    });

    setInterval(() => {}, 1000);

    return {
      success: true,
      data: {
        txId: txHash,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        monitoring: true,
        sessionId: sessionId
      } as any,
    };
  } catch (error: any) {
    spinner.stop();
    logError(isExternal, `Error in monitoring: ${error.message || error}`);
    return {
      error: error.message || error,
      success: false,
    };
  }
}
