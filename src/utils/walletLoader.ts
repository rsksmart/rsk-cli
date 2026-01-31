import { readFileSync, existsSync } from "fs";
import { Address } from "viem";
import { walletFilePath } from "./constants.js";

export interface WalletData {
  currentWallet: string;
  wallets: Record<string, {
    address: Address;
    encryptedPrivateKey: string;
    iv: string;
  }>;
}

export interface LoadedWallet {
  address: Address;
  encryptedPrivateKey: string;
  iv: string;
}

export function createErrorResult(message: string) {
  return {
    success: false as const,
    error: message
  };
}

export function loadWalletData(): { success: true; data: WalletData } | { success: false; error: string } {
  if (!existsSync(walletFilePath)) {
    return createErrorResult("No saved wallet found. Please create a wallet first.");
  }

  try {
    const walletsData = JSON.parse(readFileSync(walletFilePath, "utf8"));
    
    if (!walletsData.currentWallet || !walletsData.wallets) {
      return createErrorResult("No valid wallet found. Please create or import a wallet first.");
    }

    return { success: true, data: walletsData };
  } catch {
    return createErrorResult("Failed to read wallet data. File may be corrupted.");
  }
}

export function selectWallet(
  walletsData: WalletData, 
  walletName?: string
): { success: true; data: LoadedWallet } | { success: false; error: string } {
  const { currentWallet, wallets } = walletsData;
  
  let wallet = wallets[currentWallet];

  if (walletName) {
    if (!wallets[walletName]) {
      return createErrorResult("Wallet with the provided name does not exist.");
    }
    wallet = wallets[walletName];
  }

  const { address } = wallet;

  if (!address) {
    return createErrorResult("No valid address found in the saved wallet.");
  }

  return { success: true, data: wallet };
}