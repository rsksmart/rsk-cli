import { MonitorManager } from "../utils/monitoring/MonitorManager.js";
import chalk from "chalk";
import { Address, isAddress } from "viem";
import Table from "cli-table3";

export async function monitorCommand(
  testnet: boolean,
  txHash?: string,
  address?: Address,
  confirmations?: number,
  monitorBalance: boolean = true,
  monitorTransactions: boolean = false
): Promise<void> {
  try {
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();

    if (txHash) {
    
      if (!txHash.startsWith('0x') || txHash.length !== 66) {
        console.error(chalk.red('❌ Invalid transaction hash format.'));
        console.log(chalk.gray('Expected: 64 hex characters with 0x prefix (e.g., 0x1234...)'));
        console.log(chalk.gray(`Received: ${txHash} (length: ${txHash.length})`));
        return;
      }

      console.log(chalk.blue(`🔍 Starting transaction monitoring...`));
      console.log(chalk.gray(`Network: ${testnet ? 'Testnet' : 'Mainnet'}`));
      console.log(chalk.gray(`Transaction: ${txHash}`));
      console.log(chalk.gray(`Required confirmations: ${confirmations || 12}`));
      console.log('');

      const sessionId = await monitorManager.startTransactionMonitoring(
        txHash,
        confirmations || 12,
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

    } else if (address) {
     
      if (!isAddress(address)) {
        console.error(chalk.red('❌ Invalid address format.'));
        console.log(chalk.gray('Expected: Valid Ethereum/Rootstock address (40 hex characters with 0x prefix)'));
        console.log(chalk.gray(`Received: ${address} (length: ${String(address).length})`));
        return;
      }

      console.log(chalk.blue(`🔍 Starting address monitoring...`));
      console.log(chalk.gray(`Network: ${testnet ? 'Testnet' : 'Mainnet'}`));
      console.log(chalk.gray(`Address: ${address}`));
      console.log(chalk.gray(`Monitor balance: ${monitorBalance ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`Monitor transactions: ${monitorTransactions ? 'Yes' : 'No'}`));
      console.log('');

      const sessionId = await monitorManager.startAddressMonitoring(
        address,
        monitorBalance,
        monitorTransactions,
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

    } else {
      const activeSessions = monitorManager.getActiveSessions();
      
      if (activeSessions.length === 0) {
        console.log(chalk.yellow(`📊 No active monitoring sessions found.`));
        console.log(chalk.gray(`Use --tx <hash> or --address <address> to start monitoring.`));
        return;
      }

      console.log(chalk.blue(`📊 Active Monitoring Sessions (${activeSessions.length})`));
      console.log('');

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

      console.log(table.toString());
    }

  } catch (error: any) {
    if (error.message?.includes('Invalid address format')) {
      console.error(chalk.red('❌ Invalid address format provided.'));
      console.log(chalk.gray('Please provide a valid Ethereum/Rootstock address.'));
    } else if (error.message?.includes('Invalid transaction hash format')) {
      console.error(chalk.red('❌ Invalid transaction hash format provided.'));
      console.log(chalk.gray('Please provide a valid transaction hash.'));
    } else if (error.message?.includes('Failed to initialize monitoring')) {
      console.error(chalk.red('❌ Failed to connect to the network.'));
      console.log(chalk.gray('Please check your internet connection and try again.'));
    } else {
      console.error(chalk.red('🚨 Error in monitoring:'), error.message || error);
    }
  }
}

export async function listMonitoringSessions(testnet: boolean): Promise<void> {
  try {
    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    
    const activeSessions = monitorManager.getActiveSessions();
    
    if (activeSessions.length === 0) {
      console.log(chalk.yellow(`📊 No active monitoring sessions found.`));
      return;
    }

    console.log(chalk.blue(`📊 Active Monitoring Sessions (${activeSessions.length})`));
    console.log('');

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

    console.log(table.toString());

  } catch (error: any) {
    console.error(chalk.red('🚨 Error listing sessions:'), error.message || error);
  }
}

export async function stopMonitoringSession(sessionId: string, testnet: boolean): Promise<void> {
  try {
    if (!sessionId || sessionId.length < 8) {
      console.error(chalk.red('❌ Invalid session ID provided.'));
      console.log(chalk.gray('Please provide a valid session ID (at least 8 characters).'));
      return;
    }

    const monitorManager = new MonitorManager(testnet);
    await monitorManager.initialize();
    
    const success = await monitorManager.stopMonitoring(sessionId);
    
    if (success) {
      console.log(chalk.green(`✅ Successfully stopped monitoring session: ${sessionId}`));
    } else {
      console.log(chalk.red(`❌ Failed to stop monitoring session: ${sessionId}`));
      console.log(chalk.gray('Session not found or already stopped.'));
    }

  } catch (error: any) {
    console.error(chalk.red('🚨 Error stopping session:'), error.message || error);
  }
} 