import { walletFilePath } from "./constants.js";
import fs from "fs";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadWallets(): string {
  if (fs.existsSync(walletFilePath)) {
    const walletsData = fs.readFileSync(walletFilePath, "utf8");

    if (walletsData) {
      return walletsData ?? JSON.stringify({ wallets: {} });
    }
  }
  return JSON.stringify({ wallets: {} });
}
