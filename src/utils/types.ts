export type WalletsFile = {
  currentWallet?: string;
  wallets: { [key: string]: WalletData };
};

export type WalletData = {
  address: string;
  encryptedPrivateKey: string;
  iv: string;
};
