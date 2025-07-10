import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import { DeployResult } from "../utils/types.js";

export async function deployCommand(
  abiPath: string,
  bytecodePath: string,
  testnet: boolean,
  args: any[] = [],
  name?: string,
  _isExternal?: boolean,
  _walletsData?: any,
  _password?: string
): Promise<DeployResult | void> {
  try {
    if (!_isExternal) {
      console.log(
        chalk.blue(
          `🔧 Initializing ViemProvider for ${testnet ? "testnet" : "mainnet"}...`
        )
      );
    }
    
    const provider = new ViemProvider(testnet);

    let walletsData;
    if (_isExternal && _walletsData) {
      walletsData = _walletsData;
    } else {
      try {
        const { walletFilePath } = await import("../utils/constants.js");
        walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      } catch (error) {
        const errorMessage = "No wallets found. Please create or import a wallet first.";
        if (_isExternal) {
          return {
            error: errorMessage,
            success: false,
          };
        } else {
          console.error(chalk.red(`🚨 ${errorMessage}`));
          return;
        }
      }
    }

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.error(chalk.red(`⚠️ ${errorMessage}`));
        throw new Error(errorMessage);
      }
    }

    const walletName = name || walletsData.currentWallet;
    if (!walletsData.wallets[walletName]) {
      const errorMessage = `Wallet "${walletName}" not found.`;
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.error(chalk.red(`🚨 ${errorMessage}`));
        return;
      }
    }

    let walletClient;
    if (_isExternal) {
      const { privateKeyToAccount } = await import("viem/accounts");
      const { createWalletClient, http } = await import("viem");
      const crypto = await import("crypto");
      
      const wallet = walletsData.wallets[walletName];
      const { encryptedPrivateKey, iv } = wallet;
      
       let decryptedPrivateKey: string;
       try {
         if (!_password) {
           const errorMessage = "Password is required for external wallet decryption.";
           return {
             error: errorMessage,
             success: false,
           };
         }
         
         const password = _password;
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
        const errorMessage = "Failed to decrypt wallet. Password may be incorrect.";
        if (_isExternal) {
          return {
            error: errorMessage,
            success: false,
          };
        } else {
          console.error(chalk.red(`🚨 ${errorMessage}`));
          return;
        }
      }

      const prefixedPrivateKey = `0x${decryptedPrivateKey.replace(/^0x/, "")}`;
      const account = privateKeyToAccount(prefixedPrivateKey as `0x${string}`);

      walletClient = createWalletClient({
        chain: provider.chain,
        transport: http(),
        account: account,
      });
    } else {
      walletClient = await provider.getWalletClient(walletName);
    }

    if (!walletClient.account) {
      const errorMessage = "Wallet account is undefined. Make sure the wallet is properly loaded.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.error(chalk.red(`🚨 ${errorMessage}`));
        return;
      }
    }

    if (!_isExternal) {
      console.log(
        chalk.blue(`🔑 Wallet account: ${walletClient.account.address}`)
      );
    }

    let abiContent: string;
    let abi: any;
    
    if (_isExternal) {
      try {
        abiContent = abiPath;
        abi = JSON.parse(abiContent);
      } catch (error) {
        return {
          error: "Error parsing ABI JSON content",
          success: false,
        };
      }
    } else {
      console.log(chalk.blue(`📄 Reading ABI from ${abiPath}...`));
      try {
        abiContent = fs.readFileSync(abiPath, "utf8");
        abi = JSON.parse(abiContent);
      } catch (error) {
        const errorMessage = `Error reading or parsing ABI file: ${abiPath}`;
        console.error(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    if (!Array.isArray(abi)) {
      const errorMessage = "The ABI file is not a valid JSON array.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.error(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    let bytecode: string;
    
    if (_isExternal) {
      try {
        bytecode = bytecodePath.trim();
        if (!bytecode.startsWith("0x")) {
          bytecode = `0x${bytecode}`;
        }
      } catch (error) {
        return {
          error: "Error processing bytecode content",
          success: false,
        };
      }
    } else {
      console.log(chalk.blue(`📄 Reading Bytecode from ${bytecodePath}...`));
      try {
        bytecode = fs.readFileSync(bytecodePath, "utf8").trim();
        if (!bytecode.startsWith("0x")) {
          bytecode = `0x${bytecode}`;
        }
      } catch (error) {
        const errorMessage = `Error reading bytecode file: ${bytecodePath}`;
        console.error(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    if (!bytecode) {
      const errorMessage = "Invalid or empty bytecode file.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        console.error(chalk.red(`⚠️ ${errorMessage}`));
        return;
      }
    }

    const publicClient = await provider.getPublicClient();

    const deployParams = {
      abi,
      bytecode: bytecode as `0x${string}`,
      account: walletClient.account,
      args,
    };

    const spinner = _isExternal ? ora({isEnabled: false}) : ora("⏳ Deploying contract...").start();

    try {
      // @ts-ignore
      const hash = await walletClient.deployContract(deployParams);

      if (!_isExternal) {
        spinner.succeed("🎉 Contract deployment transaction sent!");
        console.log(`🔑 Transaction Hash: ${hash}`);
        spinner.start("⏳ Waiting for transaction receipt...");
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt?.status === "reverted") {
        throw new Error("An error occurred during contract deployment.");
      }

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/address/${receipt.contractAddress}`
        : `https://explorer.rootstock.io/address/${receipt.contractAddress}`;

      if (_isExternal) {
        return {
          success: true,
          data: {
            contractAddress: receipt.contractAddress!,
            transactionHash: hash,
            network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            explorerUrl: explorerUrl,
          },
        };
      } else {
        spinner.succeed("📜 Contract deployed successfully!");

        console.log(
          chalk.green(`📍 Contract Address: ${receipt.contractAddress}`)
        );

        console.log(
          chalk.white(`🔗 View on Explorer:`),
          chalk.dim(`${explorerUrl}`)
        );
      }
    } catch (error) {
      if (_isExternal) {
        return {
          error: `Error during contract deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          success: false,
        };
      } else {
        spinner.fail("❌ Error during contract deployment.");
        throw error;
      }
    }
  } catch (error) {
    if (_isExternal) {
      return {
        error: `Error deploying contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false,
      };
    } else {
      console.error("❌ Error deploying contract:", error);
    }
  }
}
