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
  to: Address | string;  // Can be address or RNS domain
  value: number;
};
