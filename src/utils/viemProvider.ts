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
import { WalletData } from "./types.js";

class ViemProvider {
  public chain: typeof rootstock | typeof rootstockTestnet;
  private readonly TESTNET_RPC = rootstockTestnet.rpcUrls.default.http[0];
  private readonly MAINNET_RPC = rootstock.rpcUrls.default.http[0];

  constructor(testnet: boolean) {
    this.chain = testnet ? rootstockTestnet : rootstock;
  }

  public async getPublicClient(): Promise<PublicClient> {
    const transport = http(this.testnet ? this.TESTNET_RPC : this.MAINNET_RPC, {
      timeout: 30000, // 30 seconds timeout
      retryCount: 3,  // Retry 3 times
    });

    return createPublicClient({
      chain: this.chain,
      transport,
    });
  }

  public async getWalletClient(name?: string | null): Promise<WalletClient> {
    const { account } = await this.decryptPrivateKey(name ? name : undefined);
    const transport = http(this.testnet ? this.TESTNET_RPC : this.MAINNET_RPC, {
      timeout: 30000, // 30 seconds timeout
      retryCount: 3,  // Retry 3 times
    });

    return createWalletClient({
      chain: this.chain,
      transport,
      account: account,
    });
  }

  private get testnet(): boolean {
    return this.chain.id === rootstockTestnet.id;
  }

  private async decryptPrivateKey(name: string | undefined): Promise<{
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
    let wallet = wallets[currentWallet];

    if (name) {
      if (!wallets[name]) {
        console.log(
          chalk.red("⚠️ Wallet with the provided name does not exist.")
        );

        throw new Error();
      } else {
        wallet = wallets[name];
      }
    }

    const passwordQuestion: any = [
      {
        type: "password",
        name: "password",
        message: "Enter your password to decrypt the wallet:",
        mask: "*",
      },
    ];

    const { password } = await inquirer.prompt(passwordQuestion);

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

  public async getWalletClientExternal(
    walletsData: WalletData,
    walletName: string,
    password: string,
    provider: ViemProvider
  ): Promise<WalletClient | null> {
    if (
      !walletsData ||
      !walletsData.wallets ||
      !walletsData.wallets[walletName]
    ) {
      return null;
    }
    const wallet = walletsData.wallets[walletName];
    const { encryptedPrivateKey, iv } = wallet;
    let decryptedPrivateKey: string;
    try {
      if (!password) {
        return null;
      }
      const decipherIv = Uint8Array.from(Buffer.from(iv, "hex"));
      const key = crypto.scryptSync(password, decipherIv, 32);
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        decipherIv
      );

      decryptedPrivateKey = decipher.update(encryptedPrivateKey, "hex", "utf8");
      decryptedPrivateKey += decipher.final("utf8");
    } catch (error) {
      return null;
    }

    const prefixedPrivateKey = `0x${decryptedPrivateKey.replace(/^0x/, "")}`;
    const account = privateKeyToAccount(prefixedPrivateKey as `0x${string}`);

    return createWalletClient({
      chain: provider.chain,
      transport: http(),
      account: account,
    });
  }
}

export default ViemProvider;
