import { ethers } from "ethers";
import { WalletClient } from "viem";
import crypto from "crypto";
import fs from "fs";
import { walletFilePath } from "./constants.js";

export interface WalletSignerOptions {
  testnet?: boolean;
  walletName?: string;
  isExternal?: boolean;
  walletsData?: any;
  password?: string;
}

/**
 * Creates an Ethers.js signer from RSK CLI wallet configuration
 * Handles both external and internal wallet types securely
 */
export class WalletSignerService {
  private testnet: boolean;

  constructor(testnet: boolean = false) {
    this.testnet = testnet;
  }

  /**
   * Get RPC URL for the current network
   */
  private getRpcUrl(): string {
    return this.testnet 
      ? "https://public-node.testnet.rsk.co" 
      : "https://public-node.rsk.co";
  }

  /**
   * Load wallet data from file or provided data
   */
  private async loadWalletData(options: WalletSignerOptions): Promise<any> {
    if (options.isExternal && options.walletsData) {
      return options.walletsData;
    }

    if (!fs.existsSync(walletFilePath)) {
      throw new Error("No saved wallet found. Please create a wallet first.");
    }

    return JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
  }

  /**
   * Get the wallet name to use (provided name or current wallet)
   */
  private getWalletName(walletsData: any, options: WalletSignerOptions): string {
    if (options.walletName && walletsData.wallets[options.walletName]) {
      return options.walletName;
    }

    if (!walletsData.currentWallet) {
      throw new Error("No current wallet set. Please select or create a wallet.");
    }

    return walletsData.currentWallet;
  }

  /**
   * Decrypt wallet private key using the established RSK CLI patterns
   */
  private decryptPrivateKey(wallet: any, password?: string): string {
    if (!wallet.encryptedPrivateKey || !wallet.iv) {
      throw new Error("Invalid wallet data: missing encryption information");
    }

    if (!password) {
      throw new Error("Password is required to decrypt wallet");
    }

    try {
      const decipherIv = Uint8Array.from(Buffer.from(wallet.iv, "hex"));
      const key = crypto.scryptSync(password, decipherIv, 32);
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        decipherIv
      );

      let decryptedPrivateKey = decipher.update(wallet.encryptedPrivateKey, "hex", "utf8");
      decryptedPrivateKey += decipher.final("utf8");

      return decryptedPrivateKey;
    } catch (error) {
      throw new Error("Failed to decrypt wallet private key. Please check your password.");
    }
  }

  async createSigner(options: WalletSignerOptions = {}): Promise<ethers.Signer> {
    try {
      const walletsData = await this.loadWalletData(options);
      
      if (!walletsData.wallets) {
        throw new Error("No wallets found in wallet data");
      }

      const walletName = this.getWalletName(walletsData, options);
      const wallet = walletsData.wallets[walletName];

      if (!wallet) {
        throw new Error(`Wallet "${walletName}" not found`);
      }

      if (options.isExternal && !options.password) {
        throw new Error("Password is required for external wallet operations");
      }

      const privateKey = this.decryptPrivateKey(wallet, options.password);
      
      const formattedPrivateKey = privateKey.startsWith('0x') 
        ? privateKey 
        : `0x${privateKey}`;

      const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
      const signer = new ethers.Wallet(formattedPrivateKey, provider);

      return signer;

    } catch (error) {
      throw new Error(`Failed to create signer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async canCreateSigner(options: WalletSignerOptions = {}): Promise<boolean> {
    try {
      const walletsData = await this.loadWalletData(options);
      const walletName = this.getWalletName(walletsData, options);
      const wallet = walletsData.wallets[walletName];

      if (!wallet?.encryptedPrivateKey || !wallet?.iv) {
        return false;
      }

      if (options.isExternal && !options.password) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async getWalletAddress(options: WalletSignerOptions = {}): Promise<string> {
    const walletsData = await this.loadWalletData(options);
    const walletName = this.getWalletName(walletsData, options);
    const wallet = walletsData.wallets[walletName];

    if (!wallet?.address) {
      throw new Error("Wallet address not found");
    }

    return wallet.address;
  }
}

export async function createAttestationSigner(options: WalletSignerOptions = {}): Promise<ethers.Signer | null> {
  try {
    const signerService = new WalletSignerService(options.testnet);
    
    const canCreate = await signerService.canCreateSigner(options);
    if (!canCreate) {
      return null;
    }

    return await signerService.createSigner(options);
  } catch {
    return null;
  }
}