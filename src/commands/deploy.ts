import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import { DeployResult } from "../utils/types.js";

type DeployCommandOptions = {
  abiPath: string;
  bytecodePath: string;
  testnet: boolean;
  args?: any[];
  name?: string;
  isExternal?: boolean;
  walletsData?: any;
  password?: string;
};

function logMessage(
  params: DeployCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: DeployCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: DeployCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: DeployCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}



function startSpinner(
  params: DeployCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function succeedSpinner(
  params: DeployCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  params: DeployCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.fail(message);
  }
}

export async function deployCommand(
  params: DeployCommandOptions
): Promise<DeployResult | void> {
  try {
    logInfo(params, `🔧 Initializing ViemProvider for ${params.testnet ? "testnet" : "mainnet"}...`);
    
    const provider = new ViemProvider(params.testnet);

    let walletsData;
    if (params.isExternal && params.walletsData) {
      walletsData = params.walletsData;
    } else {
      try {
        const { walletFilePath } = await import("../utils/constants.js");
        walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      } catch (error) {
        const errorMessage = "No wallets found. Please create or import a wallet first.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const walletName = params.name || walletsData.currentWallet;
    if (!walletsData.wallets[walletName]) {
      const errorMessage = `Wallet "${walletName}" not found.`;
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    let walletClient;
    if (params.isExternal) {
      const { privateKeyToAccount } = await import("viem/accounts");
      const { createWalletClient, http } = await import("viem");
      const crypto = await import("crypto");
      
      const wallet = walletsData.wallets[walletName];
      const { encryptedPrivateKey, iv } = wallet;
      
       let decryptedPrivateKey: string;
       try {
         if (!params.password) {
           const errorMessage = "Password is required for external wallet decryption.";
           return {
             error: errorMessage,
             success: false,
           };
         }
         
        const password = params.password;
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
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const prefixedPrivateKey = `0x${decryptedPrivateKey.replace(/^0x/, "")}`;
      const account = privateKeyToAccount(prefixedPrivateKey as `0x${string}`);

      walletClient = createWalletClient({
        chain: provider.chain,
        transport: http(),
        account: account,
      });
    } else {
      try {
        walletClient = await provider.getWalletClient(walletName);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Failed to decrypt the private key")) {
          const errorMessage = `Error interacting with the bridge: ${error.message}`;
          logError(params, errorMessage);
          return {
            error: errorMessage,
            success: false,
          };
        }
        throw error;
      }
    }

    if (!walletClient.account) {
      const errorMessage = "Wallet account is undefined. Make sure the wallet is properly loaded.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    logInfo(params, `🔑 Wallet account: ${walletClient.account.address}`);

    let abiContent: string;
    let abi: any;
    
    if (params.isExternal) {
      try {
        abiContent = params.abiPath;
        abi = JSON.parse(abiContent);
      } catch (error) {
        return {
          error: "Error parsing ABI JSON content",
          success: false,
        };
      }
    } else {
      logInfo(params, `📄 Reading ABI from ${params.abiPath}...`);
      try {
        abiContent = fs.readFileSync(params.abiPath, "utf8");
        abi = JSON.parse(abiContent);
      } catch (error) {
        const errorMessage = `Error reading or parsing ABI file: ${params.abiPath}`;
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!Array.isArray(abi)) {
      const errorMessage = "The ABI file is not a valid JSON array.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    let bytecode: string;
    
    if (params.isExternal) {
      try {
        bytecode = params.bytecodePath.trim();
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
      logInfo(params, `📄 Reading Bytecode from ${params.bytecodePath}...`);
      try {
        bytecode = fs.readFileSync(params.bytecodePath, "utf8").trim();
        if (!bytecode.startsWith("0x")) {
          bytecode = `0x${bytecode}`;
        }
      } catch (error) {
        const errorMessage = `Error reading bytecode file: ${params.bytecodePath}`;
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!bytecode) {
      const errorMessage = "Invalid or empty bytecode file.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const publicClient = await provider.getPublicClient();

    const deployParams = {
      abi,
      bytecode: bytecode as `0x${string}`,
      account: walletClient.account,
      args: params.args || [],
    };

    const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
    startSpinner(params, spinner, "⏳ Deploying contract...");

    try {
      // @ts-ignore
      const hash = await walletClient.deployContract(deployParams);

      succeedSpinner(params, spinner, "🎉 Contract deployment transaction sent!");
      logSuccess(params, `🔑 Transaction Hash: ${hash}`);
      startSpinner(params, spinner, "⏳ Waiting for transaction receipt...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt?.status === "reverted") {
        throw new Error("An error occurred during contract deployment.");
      }

      const explorerUrl = params.testnet
        ? `https://explorer.testnet.rootstock.io/address/${receipt.contractAddress}`
        : `https://explorer.rootstock.io/address/${receipt.contractAddress}`;

      succeedSpinner(params, spinner, "📜 Contract deployed successfully!");
      logSuccess(params, `📍 Contract Address: ${receipt.contractAddress}`);
      logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);

      return {
        success: true,
        data: {
          contractAddress: receipt.contractAddress!,
          transactionHash: hash,
          network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          explorerUrl: explorerUrl,
        },
      };
    } catch (error) {
      const errorMessage = "Error during contract deployment, please check the ABI and bytecode files.";
      failSpinner(params, spinner, "Error during contract deployment.");
      return {
        error: errorMessage,
        success: false,
      };
    }
  } catch (error) {
    const errorMessage = "Error deploying contract, please check the ABI and bytecode files.";
    logError(params, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}
