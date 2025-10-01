import { MonitorManager } from "../utils/monitoring/MonitorManager.js";
import chalk from "chalk";
import { Address, isAddress } from "viem";
import Table from "cli-table3";
import ora from "ora";

type MonitorCommandOptions = {
  testnet: boolean;
  address?: Address;
  monitorBalance?: boolean;
  monitorTransactions?: boolean;
  tx?: `0x${string}`;
  confirmations?: number;
  isExternal?: boolean;
};

function logMessage(
  params: MonitorCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: MonitorCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: MonitorCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logWarning(params: MonitorCommandOptions, message: string) {
  logMessage(params, message, chalk.yellow);
}

function logInfo(params: MonitorCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: MonitorCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: MonitorCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: MonitorCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

export async function monitorCommand(options: MonitorCommandOptions): Promise<void> {
  try {
    const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
    startSpinner(options, spinner, '⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(options.testnet);
    await monitorManager.initialize();
    succeedSpinner(options, spinner, '✅ Monitor initialized successfully');

    if (options.tx) {
      return await handleTransactionMonitoring(options, monitorManager);
    }

    if (options.address) {
      if (!isAddress(options.address)) {
        logError(options, 'Invalid address format.');
        logMessage(options, 'Expected: Valid Ethereum/Rootstock address (40 hex characters with 0x prefix)', chalk.gray);
        logMessage(options, `Received: ${options.address} (length: ${String(options.address).length})`, chalk.gray);
        return;
      }

      logInfo(options, `🔍 Starting address monitoring...`);
      logMessage(options, `Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
      logMessage(options, `Address: ${options.address}`, chalk.gray);
      logMessage(options, `Monitor balance: ${options.monitorBalance ? 'Yes' : 'No'}`, chalk.gray);
      logMessage(options, `Monitor transactions: ${options.monitorTransactions ? 'Yes' : 'No'}`, chalk.gray);
      logMessage(options, '');

      startSpinner(options, spinner, '⏳ Starting address monitoring...');
      const sessionId = await monitorManager.startAddressMonitoring(
        options.address,
        options.monitorBalance ?? true,
        options.monitorTransactions ?? false,
        options.testnet
      );
      succeedSpinner(options, spinner, '✅ Address monitoring started successfully');

      logSuccess(options, `\n🎯 Monitoring started successfully!`);
      logInfo(options, `Press Ctrl+C to stop monitoring`);
      logMessage(options, '');

      process.on('SIGINT', async () => {
        logWarning(options, `\n⏹️  Stopping monitoring...`);
        await monitorManager.stopMonitoring(sessionId);
        process.exit(0);
      });

      setInterval(() => {}, 1000);

    } else {
      const activeSessions = monitorManager.getActiveSessions();
      
      if (activeSessions.length === 0) {
        logWarning(options, `📊 No active monitoring sessions found.`);
        logMessage(options, `Use --address <address> to start monitoring an address.`, chalk.gray);
        return;
      }

      logInfo(options, `📊 Active Monitoring Sessions (${activeSessions.length})`);
      logMessage(options, '');

      const table = new Table({
        head: ['Session ID', 'Type', 'Target', 'Status', 'Checks', 'Started'],
        colWidths: [36, 12, 42, 10, 8, 20],
      });

      for (const session of activeSessions) {
        const target = session.config.type === 'transaction' 
          ? (session.config as any).txHash.slice(0, 20) + '...'
          : (session.config as any).address;
        
        table.push([
          session.id.slice(0, 8) + '...',
          session.config.type,
          target,
          session.isActive ? 'Active' : 'Stopped',
          session.checkCount.toString(),
          session.startTime.toLocaleTimeString()
        ]);
      }

      logMessage(options, table.toString());
    }

  } catch (error: any) {
    if (error.message?.includes('Invalid address format')) {
      logError(options, 'Invalid address format provided.');
      logMessage(options, 'Please provide a valid Ethereum/Rootstock address.', chalk.gray);
    } else if (error.message?.includes('Failed to initialize monitoring')) {
      logError(options, 'Failed to connect to the network.');
      logMessage(options, 'Please check your internet connection and try again.', chalk.gray);
    } else {
      logError(options, `Error in monitoring: ${error.message || error}`);
    }
  }
}

async function handleTransactionMonitoring(
  options: MonitorCommandOptions,
  monitorManager: MonitorManager
): Promise<void> {
  if (!options.tx) {
    logError(options, 'Transaction ID is required for transaction monitoring.');
    return;
  }

  const confirmations = options.confirmations ?? 12;
  
  logInfo(options, `🔍 Starting transaction monitoring...`);
  logMessage(options, `Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
  logMessage(options, `Transaction: ${options.tx}`, chalk.gray);
  logMessage(options, `Required confirmations: ${confirmations}`, chalk.gray);
  logMessage(options, '');

  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  try {
    startSpinner(options, spinner, '⏳ Starting transaction monitoring...');
    const sessionId = await monitorManager.startTransactionMonitoring(
      options.tx,
      confirmations,
      options.testnet
    );
    succeedSpinner(options, spinner, '✅ Transaction monitoring started successfully');

    logSuccess(options, `\n🎯 Monitoring started successfully!`);
    logInfo(options, `Press Ctrl+C to stop monitoring`);
    logMessage(options, '');

    process.on('SIGINT', async () => {
      logWarning(options, `\n⏹️  Stopping monitoring...`);
      await monitorManager.stopMonitoring(sessionId);
      process.exit(0);
    });

    setInterval(() => {}, 1000);
  } catch (error: any) {
    stopSpinner(options, spinner);
    logError(options, `Error in monitoring: ${error.message || error}`);
    return;
  }
}

export async function listMonitoringSessions(testnet: boolean, isExternal: boolean = false): Promise<void> {
  try {
    const options: MonitorCommandOptions = { testnet, isExternal };
    const spinner = isExternal ? ora({isEnabled: false}) : ora();
    startSpinner(options, spinner, '⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    succeedSpinner(options, spinner, '✅ Monitor initialized successfully');
    
    const activeSessions = monitorManager.getActiveSessions();
    
    if (activeSessions.length === 0) {
      logWarning(options, `📊 No active monitoring sessions found.`);
      return;
    }

    logInfo(options, `📊 Active Monitoring Sessions (${activeSessions.length})`);
    logMessage(options, '');

    const table = new Table({
      head: ['Session ID', 'Type', 'Target', 'Status', 'Checks', 'Started'],
      colWidths: [36, 12, 42, 10, 8, 20],
    });

    for (const session of activeSessions) {
      const target = session.config.type === 'transaction' 
        ? (session.config as any).txHash.slice(0, 20) + '...'
        : (session.config as any).address;
      
      table.push([
        session.id.slice(0, 8) + '...',
        session.config.type,
        target,
        session.isActive ? 'Active' : 'Stopped',
        session.checkCount.toString(),
        session.startTime.toLocaleTimeString()
      ]);
    }

    logMessage(options, table.toString());

  } catch (error: any) {
    const options: MonitorCommandOptions = { testnet, isExternal };
    logError(options, `Error listing sessions: ${error.message || error}`);
  }
}

export async function stopMonitoringSession(sessionId: string, testnet: boolean, isExternal: boolean = false): Promise<void> {
  try {
    const options: MonitorCommandOptions = { testnet, isExternal };
    
    if (!sessionId || sessionId.length < 8) {
      logError(options, 'Invalid session ID provided.');
      logMessage(options, 'Please provide a valid session ID (at least 8 characters).', chalk.gray);
      return;
    }

    const spinner = isExternal ? ora({isEnabled: false}) : ora();
    startSpinner(options, spinner, '⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    succeedSpinner(options, spinner, '✅ Monitor initialized successfully');
    
    startSpinner(options, spinner, '⏳ Stopping monitoring session...');
    const success = await monitorManager.stopMonitoring(sessionId);
    if (success) {
      succeedSpinner(options, spinner, '✅ Monitoring session stopped successfully');
      logSuccess(options, `Session ${sessionId} stopped successfully`);
    } else {
      stopSpinner(options, spinner);
      logError(options, `Failed to stop monitoring session: ${sessionId}`);
      logMessage(options, 'Session not found or already stopped.', chalk.gray);
    }

  } catch (error: any) {
    const options: MonitorCommandOptions = { testnet, isExternal };
    logError(options, `Error stopping session: ${error.message || error}`);
  }
} 