import { MonitorManager } from "../utils/monitoring/MonitorManager.js";
import { Address, isAddress } from "viem";
import Table from "cli-table3";
import { logError, logSuccess, logInfo, logWarning, logMessage } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";
import chalk from "chalk";

type MonitorCommandOptions = {
  testnet: boolean;
  address?: Address;
  monitorBalance?: boolean;
  monitorTransactions?: boolean;
  tx?: `0x${string}`;
  confirmations?: number;
  isExternal?: boolean;
};

export async function monitorCommand(options: MonitorCommandOptions): Promise<void> {
  try {
    const spinner = createSpinner(options.isExternal || false);
    spinner.start('⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(options.testnet);
    await monitorManager.initialize();
    spinner.succeed('✅ Monitor initialized successfully');

    if (options.tx) {
      return await handleTransactionMonitoring(options, monitorManager);
    }

    if (options.address) {
      if (!isAddress(options.address)) {
        const isExternal = options.isExternal || false;
        logError(isExternal, 'Invalid address format.');
        logMessage(isExternal, 'Expected: Valid Ethereum/Rootstock address (40 hex characters with 0x prefix)', chalk.gray);
        logMessage(isExternal, `Received: ${options.address} (length: ${String(options.address).length})`, chalk.gray);
        return;
      }

      const isExternal = options.isExternal || false;
      logInfo(isExternal, `🔍 Starting address monitoring...`);
      logMessage(isExternal, `Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
      logMessage(isExternal, `Address: ${options.address}`, chalk.gray);
      logMessage(isExternal, `Monitor balance: ${options.monitorBalance ? 'Yes' : 'No'}`, chalk.gray);
      logMessage(isExternal, `Monitor transactions: ${options.monitorTransactions ? 'Yes' : 'No'}`, chalk.gray);
      logMessage(isExternal, '', chalk.white);

      spinner.start('⏳ Starting address monitoring...');
      const sessionId = await monitorManager.startAddressMonitoring(
        options.address,
        options.monitorBalance ?? true,
        options.monitorTransactions ?? false,
        options.testnet
      );
      spinner.succeed('✅ Address monitoring started successfully');

      logSuccess(isExternal, `\n🎯 Monitoring started successfully!`);
      logInfo(isExternal, `Press Ctrl+C to stop monitoring`);
      logMessage(isExternal, '', chalk.white);

      process.on('SIGINT', async () => {
        logWarning(isExternal, `\n⏹️  Stopping monitoring...`);
        await monitorManager.stopMonitoring(sessionId);
        process.exit(0);
      });

      setInterval(() => {}, 1000);

    } else {
      const activeSessions = monitorManager.getActiveSessions();
      
      const isExternal = options.isExternal || false;
      if (activeSessions.length === 0) {
        logWarning(isExternal, `📊 No active monitoring sessions found.`);
        logMessage(isExternal, `Use --address <address> to start monitoring an address.`, chalk.gray);
        return;
      }

      logInfo(isExternal, `📊 Active Monitoring Sessions (${activeSessions.length})`);
      logMessage(isExternal, '', chalk.white);

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

      logMessage(isExternal, table.toString(), chalk.white);
    }

  } catch (error: any) {
    const isExternal = options.isExternal || false;
    if (error.message?.includes('Invalid address format')) {
      logError(isExternal, 'Invalid address format provided.');
      logMessage(isExternal, 'Please provide a valid Ethereum/Rootstock address.', chalk.gray);
    } else if (error.message?.includes('Failed to initialize monitoring')) {
      logError(isExternal, 'Failed to connect to the network.');
      logMessage(isExternal, 'Please check your internet connection and try again.', chalk.gray);
    } else {
      logError(isExternal, `Error in monitoring: ${error.message || error}`);
    }
  }
}

async function handleTransactionMonitoring(
  options: MonitorCommandOptions,
  monitorManager: MonitorManager
): Promise<void> {
  const isExternal = options.isExternal || false;

  if (!options.tx) {
    logError(isExternal, 'Transaction ID is required for transaction monitoring.');
    return;
  }

  const confirmations = options.confirmations ?? 12;

  logInfo(isExternal, `🔍 Starting transaction monitoring...`);
  logMessage(isExternal, `Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
  logMessage(isExternal, `Transaction: ${options.tx}`, chalk.gray);
  logMessage(isExternal, `Required confirmations: ${confirmations}`, chalk.gray);
  logMessage(isExternal, '', chalk.white);

  const spinner = createSpinner(isExternal);
  try {
    spinner.start('⏳ Starting transaction monitoring...');
    const sessionId = await monitorManager.startTransactionMonitoring(
      options.tx,
      confirmations,
      options.testnet
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
  } catch (error: any) {
    spinner.stop();
    logError(isExternal, `Error in monitoring: ${error.message || error}`);
    return;
  }
}

export async function listMonitoringSessions(testnet: boolean, isExternal: boolean = false): Promise<void> {
  try {
    const options: MonitorCommandOptions = { testnet, isExternal };
    const spinner = createSpinner(isExternal);
    spinner.start('⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    spinner.succeed('✅ Monitor initialized successfully');

    const activeSessions = monitorManager.getActiveSessions();

    if (activeSessions.length === 0) {
      logWarning(isExternal, `📊 No active monitoring sessions found.`);
      return;
    }

    logInfo(isExternal, `📊 Active Monitoring Sessions (${activeSessions.length})`);
    logMessage(isExternal, '', chalk.white);

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

    logMessage(isExternal, table.toString(), chalk.white);

  } catch (error: any) {
    logError(isExternal, `Error listing sessions: ${error.message || error}`);
  }
}

export async function stopMonitoringSession(sessionId: string, testnet: boolean, isExternal: boolean = false): Promise<void> {
  try {
    if (!sessionId || sessionId.length < 8) {
      logError(isExternal, 'Invalid session ID provided.');
      logMessage(isExternal, 'Please provide a valid session ID (at least 8 characters).', chalk.gray);
      return;
    }

    const spinner = createSpinner(isExternal);
    spinner.start('⏳ Initializing monitor...');
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    spinner.succeed('✅ Monitor initialized successfully');

    spinner.start('⏳ Stopping monitoring session...');
    const success = await monitorManager.stopMonitoring(sessionId);
    if (success) {
      spinner.succeed('✅ Monitoring session stopped successfully');
      logSuccess(isExternal, `Session ${sessionId} stopped successfully`);
    } else {
      spinner.stop();
      logError(isExternal, `Failed to stop monitoring session: ${sessionId}`);
      logMessage(isExternal, 'Session not found or already stopped.', chalk.gray);
    }

  } catch (error: any) {
    logError(isExternal, `Error stopping session: ${error.message || error}`);
  }
} 