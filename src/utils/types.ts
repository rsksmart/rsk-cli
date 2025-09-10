import { Address } from "viem";

export type WalletData = {
  wallets: {
    [key: string]: WalletItem;
  };
  currentWallet: string;
}

export type WalletItem = {
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

export type TxResult = {
  success: boolean;
  data?: DataTx;
  error?: string;
};

export type DataTx = {
  txId: string;
  blockHash: string;
  blockNumber: string;
  gasUsed: string;
  status: "Success" | "Failed";
  from: string;
  to: string | null;
  network: string;
};

export type ContractResult = {
  success: boolean;
  data?: ContractData;
  error?: string;
};

export type ContractData = {
  contractAddress: string;
  network: string;
  functionName: string;
  result: any;
  explorerUrl: string;
};

export type DeployResult = {
  success: boolean;
  data?: DeployData;
  error?: string;
};

export type DeployData = {
  contractAddress: string;
  transactionHash: string;
  network: string;
  explorerUrl: string;
};

export type VerifyResult = {
  success: boolean;
  data?: VerifyData;
  error?: string;
};

export type VerifyData = {
  contractAddress: string;
  contractName: string;
  network: string;
  explorerUrl: string;
  verified: boolean;
  alreadyVerified?: boolean;
  verificationData?: any;
};

export type VerificationRequest = {
  address: string;
  name: string;
  version: string;
  sources: string;
  settings: any;
  constructorArguments?: any[];
};