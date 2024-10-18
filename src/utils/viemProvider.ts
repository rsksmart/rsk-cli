import {
  createPublicClient,
  createWalletClient,
  http,
  WalletClient,
  PublicClient,
} from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import crypto from "crypto";
import inquirer from "inquirer";
import chalk from "chalk";
import { walletFilePath } from "./constants.js";

class ViemProvider {
  public chain: typeof rootstock | typeof rootstockTestnet;

  constructor(testnet: boolean) {
    this.chain = testnet ? rootstockTestnet : rootstock;
  }

  public async getPublicClient(): Promise<PublicClient> {
    return createPublicClient({
      chain: this.chain,
      transport: http(),
    });
  }

  public async getWalletClient(): Promise<WalletClient> {
    const { account } = await this.decryptPrivateKey();

    return createWalletClient({
      chain: this.chain,
      transport: http(),
      account: account,
    });
  }

  private async decryptPrivateKey(): Promise<{
    account: ReturnType<typeof privateKeyToAccount>;
  }> {
    if (!fs.existsSync(walletFilePath)) {
      throw new Error(
        "No wallets found. Please create or import a wallet first."
      );
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    if (!walletsData.currentWallet || !walletsData.wallets) {
      console.log(
        chalk.red(
          "⚠️ No valid wallet found. Please create or import a wallet first."
        )
      );
      throw new Error();
    }

    const { currentWallet, wallets } = walletsData;

    const passwordQuestion: any = [
      {
        type: "password",
        name: "password",
        message: "Enter your password to decrypt the wallet:",
        mask: "*",
      },
    ];

    const { password } = await inquirer.prompt(passwordQuestion);

    const wallet = wallets[currentWallet];
    const { encryptedPrivateKey, iv } = wallet;

    try {
      const decipherIv = Uint8Array.from(Buffer.from(iv, "hex"));
      const key = crypto.scryptSync(password, decipherIv, 32);
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        decipherIv
      );

      let decryptedPrivateKey = decipher.update(
        encryptedPrivateKey,
        "hex",
        "utf8"
      );
      decryptedPrivateKey += decipher.final("utf8");

      const prefixedPrivateKey = `0x${decryptedPrivateKey.replace(/^0x/, "")}`;

      const account = privateKeyToAccount(prefixedPrivateKey as `0x${string}`);

      return { account };
    } catch (error) {
      throw new Error(
        "Failed to decrypt the private key. Please check your password and try again."
      );
    }
  }
}

export default ViemProvider;
