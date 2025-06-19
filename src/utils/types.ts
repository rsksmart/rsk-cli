import { Address } from "viem";

export type WalletsFile = {
  currentWallet?: string;
  wallets: { [key: string]: WalletData };
};

export type WalletData = {
  address: string;
  encryptedPrivateKey: string;
  iv: string;
};

export type FileTx = {
  to: Address;
  value: bigint;
};


export type MonitoringType = 'transaction' | 'address';

export type TransactionMonitoringConfig = {
  type: 'transaction';
  txHash: string;
  confirmations?: number;
  testnet: boolean;
};

export type AddressMonitoringConfig = {
  type: 'address';
  address: Address;
  monitorBalance: boolean;
  monitorTransactions: boolean;
  testnet: boolean;
};

export type MonitoringConfig = TransactionMonitoringConfig | AddressMonitoringConfig;

export type MonitoringSession = {
  id: string;
  config: MonitoringConfig;
  startTime: Date;
  isActive: boolean;
  lastCheck: Date;
  checkCount: number;
};

export type MonitoringState = {
  sessions: MonitoringSession[];
  globalSettings: {
    defaultPollingInterval: number; 
    maxConcurrentSessions: number;
    defaultConfirmations: number;
  };
};
