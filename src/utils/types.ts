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