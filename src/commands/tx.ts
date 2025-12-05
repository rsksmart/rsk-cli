import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import Table from "cli-table3";
import { DataTx, TxResult } from "../utils/types.js";
import { MonitorManager } from "../utils/monitoring/MonitorManager.js";
import ora from "ora";

type TxCommandOptions = {
  testnet: boolean;
  txid: string;
  isExternal?: boolean;
  pipeInput?: any;
  monitor?: boolean;
  confirmations?: number;
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

function logSuccess(params: TxCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: TxCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function logWarning(params: TxCommandOptions, message: string) {
  logMessage(params, message, chalk.yellow);
}

function startSpinner(
  params: TxCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: TxCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: TxCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
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
      const network = params.testnet ? "testnet" : "mainnet";
      const oppositeNetwork = params.testnet ? "mainnet" : "testnet";
      const errorMessage = `Transaction not found on ${network}. Please check the transaction ID and network. Try with --testnet flag if the transaction is on ${oppositeNetwork}.`;
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
    
    logError(params, errorMessage);
    
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
  const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
  
  try {
    const confirmations = params.confirmations ?? 12;
    
    logInfo(params, `🔍 Starting transaction monitoring...`);
    logMessage(params, `Network: ${params.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
    logMessage(params, `Transaction: ${txHash}`, chalk.gray);
    logMessage(params, `Required confirmations: ${confirmations}`, chalk.gray);
    logMessage(params, '');

    startSpinner(params, spinner, '⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(params.testnet);
    await monitorManager.initialize();
    succeedSpinner(params, spinner, '✅ Monitor initialized successfully');

    startSpinner(params, spinner, '⏳ Starting transaction monitoring...');
    const sessionId = await monitorManager.startTransactionMonitoring(
      txHash,
      confirmations,
      params.testnet
    );
    succeedSpinner(params, spinner, '✅ Transaction monitoring started successfully');

    logSuccess(params, `\n🎯 Monitoring started successfully!`);
    logInfo(params, `Press Ctrl+C to stop monitoring`);
    logMessage(params, '');

    process.on('SIGINT', async () => {
      logWarning(params, `\n⏹️  Stopping monitoring...`);
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
    stopSpinner(params, spinner);
    logError(params, `Error in monitoring: ${error.message || error}`);
    return {
      error: error.message || error,
      success: false,
    };
  }
}
