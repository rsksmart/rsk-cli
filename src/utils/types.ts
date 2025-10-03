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

export type SimulationResult = {
  success: boolean;
  data?: SimulationData;
  error?: string;
};

export type SimulationData = {
  from: string;
  to: string;
  value: string;
  gasEstimate: string;
  gasPrice: string;
  totalCost: string;
  network: string;
  tokenInfo?: {
    name: string;
    symbol: string;
    decimals: number;
    contract: string;
  };
  simulationDetails: {
    blockNumber: string;
    timestamp: string;
    nonce: number;
    chainId: number;
  };
};

export type SimulationOptions = {
  testnet: boolean;
  toAddress: `0x${string}`;
  value: number;
  name?: string;
  tokenAddress?: `0x${string}`;
  txOptions?: {
    gasLimit?: bigint;
    gasPrice?: bigint;
    data?: `0x${string}`;
  };
};