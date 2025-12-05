import { PublicClient, Address, isAddress } from 'viem';
import ViemProvider from '../viemProvider.js';
import {
  MonitoringSession,
  TransactionMonitoringConfig,
  AddressMonitoringConfig,
  MonitoringState
} from '../types.js';
import fs from 'fs';
import path from 'path';
import { v4 } from 'uuid';
import chalk from 'chalk';

function logMessage(message: string, color: any = chalk.white) {
  console.log(color(message));
}

function logError(message: string) {
  logMessage(`❌ ${message}`, chalk.red);
}

function logSuccess(message: string) {
  logMessage(`✅ ${message}`, chalk.green);
}

function logWarning(message: string) {
  logMessage(`⚠️  ${message}`, chalk.yellow);
}

function logInfo(message: string) {
  logMessage(`📊 ${message}`, chalk.blue);
}

export class MonitorManager {
  private sessions: Map<string, MonitoringSession> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private viemProvider: ViemProvider;
  private publicClient!: PublicClient;
  private stateFilePath: string;
  private isInitialized = false;

  constructor(testnet: boolean = false) {
    this.viemProvider = new ViemProvider(testnet);
    this.stateFilePath = path.join(process.cwd(), '.rsk-monitoring.json');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.publicClient = await this.viemProvider.getPublicClient();
      await this.loadState();
      this.isInitialized = true;
    } catch (error) {
      logError(`Failed to initialize monitoring: ${error}`);
      throw error;
    }
  }

  async startTransactionMonitoring(
    txHash: string,
    confirmations: number = 12,
    testnet: boolean = false
  ): Promise<string> {
    await this.initialize();

  
    if (!txHash.startsWith('0x') || txHash.length !== 66) {
      throw new Error(`Invalid transaction hash format: ${txHash}. Expected 64 hex characters with 0x prefix.`);
    }

    const config: TransactionMonitoringConfig = {
      type: 'transaction',
      txHash,
      confirmations,
      testnet
    };

    const sessionId = v4();
    const session: MonitoringSession = {
      id: sessionId,
      config,
      startTime: new Date(),
      isActive: true,
      lastCheck: new Date(),
      checkCount: 0
    };

    this.sessions.set(sessionId, session);
    this.startPolling(sessionId);
    await this.saveState();

    logSuccess(`Started monitoring transaction: ${txHash}`);
    logInfo(`Session ID: ${sessionId}`);
    
    return sessionId;
  }

  async startAddressMonitoring(
    address: Address,
    monitorBalance: boolean = true,
    monitorTransactions: boolean = false,
    testnet: boolean = false
  ): Promise<string> {
    await this.initialize();

  
    if (!isAddress(address)) {
      throw new Error(`Invalid address format: ${address}. Expected a valid Ethereum/Rootstock address.`);
    }

    const config: AddressMonitoringConfig = {
      type: 'address',
      address,
      monitorBalance,
      monitorTransactions,
      testnet
    };

    const sessionId = v4();
    const session: MonitoringSession = {
      id: sessionId,
      config,
      startTime: new Date(),
      isActive: true,
      lastCheck: new Date(),
      checkCount: 0
    };

    this.sessions.set(sessionId, session);
    this.startPolling(sessionId);
    await this.saveState();

    logSuccess(`Started monitoring address: ${address}`);
    logInfo(`Session ID: ${sessionId}`);
    
    return sessionId;
  }

  async stopMonitoring(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logError(`Session ${sessionId} not found`);
      return false;
    }

    session.isActive = false;
    this.sessions.set(sessionId, session);
    
    const interval = this.pollingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(sessionId);
    }

    await this.saveState();
    logWarning(`Stopped monitoring session: ${sessionId}`);

    const activeSessions = this.getActiveSessions();
    if (activeSessions.length === 0) {
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }

    return true;
  }

  async stopAllMonitoring(): Promise<void> {
    for (const [sessionId] of this.sessions) {
      await this.stopMonitoring(sessionId);
    }
    logWarning(`Stopped all monitoring sessions`);
  }

  getActiveSessions(): MonitoringSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  private startPolling(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const interval = setInterval(async () => {
      try {
        await this.checkSession(sessionId);
      } catch (error) {
        logError(`Error checking session ${sessionId}: ${error}`);
        
        const session = this.sessions.get(sessionId);
        if (session && session.checkCount > 10) {
          logWarning(`Too many errors, stopping session ${sessionId}`);
          await this.stopMonitoring(sessionId);
        }
      }
    }, 10000);

    this.pollingIntervals.set(sessionId, interval);
  }

  private async checkSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;

    session.lastCheck = new Date();
    session.checkCount++;

    if (session.config.type === 'transaction') {
      await this.checkTransaction(session);
    } else if (session.config.type === 'address') {
      await this.checkAddress(session);
    }

    this.sessions.set(sessionId, session);
  }

  private async checkTransaction(session: MonitoringSession): Promise<void> {
    const config = session.config as TransactionMonitoringConfig;
    
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: config.txHash as `0x${string}` });
      const currentBlock = await this.publicClient.getBlockNumber();
      
      const confirmations = receipt ? Number(currentBlock - receipt.blockNumber) : 0;
      const status = receipt ? (receipt.status === 'success' ? 'confirmed' : 'failed') : 'pending';

      logInfo(`TX ${config.txHash.slice(0, 10)}... - Status: ${status}, Confirmations: ${confirmations}`);

      if (receipt && (status === 'failed' || confirmations >= (config.confirmations || 12))) {
        if (status === 'failed') {
          logError(`Transaction ${config.txHash.slice(0, 10)}... failed`);
        } else {
          logSuccess(`Transaction ${config.txHash.slice(0, 10)}... confirmed with ${confirmations} confirmations`);
        }
        await this.stopMonitoring(session.id);
      }

    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('pending')) {
        logWarning(`Transaction ${config.txHash.slice(0, 10)}... not found or pending`);
      } else {
        logError(`Error checking transaction ${config.txHash.slice(0, 10)}...: ${error.message || error}`);
        if (session.checkCount > 10) {
          logWarning(`Too many errors, stopping monitoring`);
          await this.stopMonitoring(session.id);
        }
      }
    }
  }

  private async checkAddress(session: MonitoringSession): Promise<void> {
    const config = session.config as AddressMonitoringConfig;
    
    try {
      if (config.monitorBalance) {
        const currentBalance = await this.publicClient.getBalance({ address: config.address });
        logInfo(`Address ${config.address.slice(0, 10)}... - Balance: ${currentBalance} wei`);
      }

      if (config.monitorTransactions) {
        logInfo(`Checking transactions for ${config.address.slice(0, 10)}...`);
      }

    } catch (error: any) {
      if (error.message?.includes('Invalid address')) {
        logError(`Invalid address format: ${config.address}`);
        logWarning(`Stopping monitoring for invalid address`);
        await this.stopMonitoring(session.id);
      } else if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
        logWarning(`Rate limited, will retry later`);
      } else {
        logError(`Error checking address ${config.address.slice(0, 10)}...: ${error.message || error}`);
      }
    }
  }

  private async loadState(): Promise<void> {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        const state: MonitoringState = JSON.parse(data);
        
        for (const session of state.sessions) {
          if (session.isActive) {
            session.isActive = false;
          }
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      logWarning(`Could not load monitoring state: ${error}`);
    }
  }

  private async saveState(): Promise<void> {
    try {
      const state: MonitoringState = {
        sessions: Array.from(this.sessions.values()),
        globalSettings: {
          defaultPollingInterval: 10,
          maxConcurrentSessions: 10,
          defaultConfirmations: 12
        }
      };

      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
    } catch (error) {
      logError(`Could not save monitoring state: ${error}`);
    }
  }
} 