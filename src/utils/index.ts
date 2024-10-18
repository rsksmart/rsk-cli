import { walletFilePath } from "./constants";
import { WalletsFile } from "./types";
import fs from "fs";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadWallets(): WalletsFile {
  if (fs.existsSync(walletFilePath)) {
    return JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
  }
  return { wallets: {} };
}
