import { existsSync, readFileSync } from "fs";
import crypto from "crypto";
import inquirer from "inquirer";
import { ethers, Wallet } from "ethers";
import { walletFilePath } from "./constants.js";

/**
 * Decrypts the local wallet and returns an Ethers.js Wallet instance.
 * @param walletName - The name of the wallet to load (optional, defaults to current).
 * @param providerUrl - The RPC URL to connect to.
 */
export async function getEthersSigner(
  walletName: string | undefined,
  providerUrl: string
): Promise<Wallet> {
  if (!existsSync(walletFilePath)) {
    throw new Error("No wallet file found. Please create one first.");
  }

  const walletsData = JSON.parse(readFileSync(walletFilePath, "utf8"));

  // Use provided name or fall back to the "currentWallet" field in JSON
  const name = walletName || walletsData.currentWallet;

  if (!walletsData.wallets || !walletsData.wallets[name]) {
    throw new Error(`Wallet '${name}' not found.`);
  }

  const walletData = walletsData.wallets[name];

  // Prompt for password
  const { password } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: `Enter password for wallet '${name}':`,
      mask: "*",
    },
  ]);

  try {
    // Decrypt
    const iv = Uint8Array.from(Buffer.from(walletData.iv, "hex"));
    const key = crypto.scryptSync(password, iv, 32);
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Uint8Array.from(key),
      iv
    );

    let decrypted = decipher.update(
      walletData.encryptedPrivateKey,
      "hex",
      "utf8"
    );
    decrypted += decipher.final("utf8");

    const provider = new ethers.providers.JsonRpcProvider(providerUrl);

    // The strict "0x" prefix is safer for Ethers
    const privateKey = decrypted.startsWith("0x")
      ? decrypted
      : `0x${decrypted}`;

    return new Wallet(privateKey, provider);
  } catch (error) {
    throw new Error("Incorrect password or corrupted wallet file.");
  }
}
