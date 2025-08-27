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
};

function logMessage(message: string, color: any = chalk.white) {
  console.log(color(message));
}

function logError(message: string) {
  logMessage(`❌ ${message}`, chalk.red);
}

function logSuccess(message: string) {
  logMessage(message, chalk.green);
}

function logWarning(message: string) {
  logMessage(message, chalk.yellow);
}

function logInfo(message: string) {
  logMessage(message, chalk.blue);
}

export async function monitorCommand(options: MonitorCommandOptions): Promise<void> {
  try {
    const spinner = ora('Initializing monitor...').start();
    const monitorManager = new MonitorManager(options.testnet);
    await monitorManager.initialize();
    spinner.stop();

    if (options.tx) {
      return await handleTransactionMonitoring(options, monitorManager);
    }

    if (options.address) {
      if (!isAddress(options.address)) {
        logError('Invalid address format.');
        logMessage('Expected: Valid Ethereum/Rootstock address (40 hex characters with 0x prefix)', chalk.gray);
        logMessage(`Received: ${options.address} (length: ${String(options.address).length})`, chalk.gray);
        return;
      }

      logInfo(`🔍 Starting address monitoring...`);
      logMessage(`Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
      logMessage(`Address: ${options.address}`, chalk.gray);
      logMessage(`Monitor balance: ${options.monitorBalance ? 'Yes' : 'No'}`, chalk.gray);
      logMessage(`Monitor transactions: ${options.monitorTransactions ? 'Yes' : 'No'}`, chalk.gray);
      logMessage('');

      spinner.start('Starting monitoring...');
      const sessionId = await monitorManager.startAddressMonitoring(
        options.address,
        options.monitorBalance ?? true,
        options.monitorTransactions ?? false,
        options.testnet
      );
      spinner.stop();

      logSuccess(`\n🎯 Monitoring started successfully!`);
      logInfo(`Press Ctrl+C to stop monitoring`);
      logMessage('');

      process.on('SIGINT', async () => {
        logWarning(`\n⏹️  Stopping monitoring...`);
        await monitorManager.stopMonitoring(sessionId);
        process.exit(0);
      });

      setInterval(() => {}, 1000);

    } else {
      const activeSessions = monitorManager.getActiveSessions();
      
      if (activeSessions.length === 0) {
        logWarning(`📊 No active monitoring sessions found.`);
        logMessage(`Use --address <address> to start monitoring an address.`, chalk.gray);
        return;
      }

      logInfo(`📊 Active Monitoring Sessions (${activeSessions.length})`);
      logMessage('');

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

      logMessage(table.toString());
    }

  } catch (error: any) {
    if (error.message?.includes('Invalid address format')) {
      logError('Invalid address format provided.');
      logMessage('Please provide a valid Ethereum/Rootstock address.', chalk.gray);
    } else if (error.message?.includes('Failed to initialize monitoring')) {
      logError('Failed to connect to the network.');
      logMessage('Please check your internet connection and try again.', chalk.gray);
    } else {
      logError(`Error in monitoring: ${error.message || error}`);
    }
  }
}

async function handleTransactionMonitoring(
  options: MonitorCommandOptions,
  monitorManager: MonitorManager
): Promise<void> {
  if (!options.tx) {
    logError('Transaction ID is required for transaction monitoring.');
    return;
  }

  const confirmations = options.confirmations ?? 12;
  
  logInfo(`🔍 Starting transaction monitoring...`);
  logMessage(`Network: ${options.testnet ? 'Testnet' : 'Mainnet'}`, chalk.gray);
  logMessage(`Transaction: ${options.tx}`, chalk.gray);
  logMessage(`Required confirmations: ${confirmations}`, chalk.gray);
  logMessage('');

  const spinner = ora('Starting transaction monitoring...').start();
  const sessionId = await monitorManager.startTransactionMonitoring(
    options.tx,
    confirmations,
    options.testnet
  );
  spinner.stop();

  logSuccess(`\n🎯 Monitoring started successfully!`);
  logInfo(`Press Ctrl+C to stop monitoring`);
  logMessage('');

  process.on('SIGINT', async () => {
    logWarning(`\n⏹️  Stopping monitoring...`);
    await monitorManager.stopMonitoring(sessionId);
    process.exit(0);
  });

  setInterval(() => {}, 1000);
}

export async function listMonitoringSessions(testnet: boolean): Promise<void> {
  try {
    const spinner = ora('Initializing monitor...').start();
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    spinner.stop();
    
    const activeSessions = monitorManager.getActiveSessions();
    
    if (activeSessions.length === 0) {
      logWarning(`📊 No active monitoring sessions found.`);
      return;
    }

    logInfo(`📊 Active Monitoring Sessions (${activeSessions.length})`);
    logMessage('');

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

    logMessage(table.toString());

  } catch (error: any) {
    logError(`Error listing sessions: ${error.message || error}`);
  }
}

export async function stopMonitoringSession(sessionId: string, testnet: boolean): Promise<void> {
  try {
    if (!sessionId || sessionId.length < 8) {
      logError('Invalid session ID provided.');
      logMessage('Please provide a valid session ID (at least 8 characters).', chalk.gray);
      return;
    }

    const spinner = ora('Initializing monitor...').start();
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    spinner.stop();
    
    const success = await monitorManager.stopMonitoring(sessionId);
    
    if (success) {
      logSuccess(`✅ Successfully stopped monitoring session: ${sessionId}`);
    } else {
      logError(`Failed to stop monitoring session: ${sessionId}`);
      logMessage('Session not found or already stopped.', chalk.gray);
    }

  } catch (error: any) {
    logError(`Error stopping session: ${error.message || error}`);
  }
} 