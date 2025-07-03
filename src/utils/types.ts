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
