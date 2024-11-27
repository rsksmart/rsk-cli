export type WalletsFile = {
  currentWallet?: string;
  wallets: { [key: string]: WalletData };
};

export type WalletData = {
  address: string;
  encryptedPrivateKey: string;
  iv: string;
};

export type InquirerAnswers = {
  action?: string;
  password?: string;
  saveWallet?: boolean;
  walletName?: string;
  privateKey?: string;
  address?: string;
  setCurrentWallet?: boolean;
  confirmDelete?: boolean;
  newWalletName?: string;
};
