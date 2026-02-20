import ViemProvider from "../utils/viemProvider.js";
import fs from "fs";
import { DeployResult } from "../utils/types.js";
import { DeploymentAttestationData, AttestationService } from "../utils/attestation.js";
import { handleAttestation } from "../utils/attestationHandler.js";
import { getConfig } from "./config.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";
import { getExplorerUrl, getNetworkName, getCurrentTimestamp, extractContractName } from "../utils/constants.js";

type DeployCommandOptions = {
  abiPath: string;
  bytecodePath: string;
  testnet?: boolean;
  args?: any[];
  name?: string;
  isExternal?: boolean;
  walletsData?: any;
  password?: string;
  attestation?: {
    enabled: boolean;
    schemaUID?: string;
    recipient?: string;
  };
};

export async function deployCommand(
  params: DeployCommandOptions
): Promise<DeployResult | void> {
  const isExternal = params.isExternal || false;

  try {
    const config = getConfig();
    const isTestnet = params.testnet !== undefined ? params.testnet : (config.defaultNetwork === 'testnet');

    logInfo(isExternal, `🔧 Initializing ViemProvider for ${isTestnet ? "testnet" : "mainnet"}...`);
    
    const provider = new ViemProvider(isTestnet);

    let walletsData;
    if (params.isExternal && params.walletsData) {
      walletsData = params.walletsData;
    } else {
      try {
        const { walletFilePath } = await import("../utils/constants.js");
        walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      } catch (error) {
        const errorMessage = "No wallets found. Please create or import a wallet first.";
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      logError(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const walletName = params.name || walletsData.currentWallet;
    if (!walletsData.wallets[walletName]) {
      const errorMessage = `Wallet "${walletName}" not found.`;
      logError(isExternal, errorMessage);
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
        logError(isExternal, errorMessage);
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
          logError(isExternal, errorMessage);
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
      logError(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    logInfo(isExternal, `🔑 Wallet account: ${walletClient.account.address}`);

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
      logInfo(isExternal, `📄 Reading ABI from ${params.abiPath}...`);
      try {
        abiContent = fs.readFileSync(params.abiPath, "utf8");
        abi = JSON.parse(abiContent);
      } catch (error) {
        const errorMessage = `Error reading or parsing ABI file: ${params.abiPath}`;
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!Array.isArray(abi)) {
      const errorMessage = "The ABI file is not a valid JSON array.";
      logError(isExternal, errorMessage);
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
      logInfo(isExternal, `📄 Reading Bytecode from ${params.bytecodePath}...`);
      try {
        bytecode = fs.readFileSync(params.bytecodePath, "utf8").trim();
        if (!bytecode.startsWith("0x")) {
          bytecode = `0x${bytecode}`;
        }
      } catch (error) {
        const errorMessage = `Error reading bytecode file: ${params.bytecodePath}`;
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }

    if (!bytecode) {
      const errorMessage = "Invalid or empty bytecode file.";
      logError(isExternal, errorMessage);
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
      ...(config.defaultGasLimit > 0 ? { gas: BigInt(config.defaultGasLimit) } : {}),
      ...(config.defaultGasPrice > 0 ? { maxFeePerGas: BigInt(config.defaultGasPrice * 1e9) } : {}),
    };

    const spinner = createSpinner(isExternal);
    spinner.start("⏳ Deploying contract...");

    try {
      // @ts-ignore
      const hash = await walletClient.deployContract(deployParams);

      spinner.succeed("🎉 Contract deployment transaction sent!");
      logSuccess(isExternal, `🔑 Transaction Hash: ${hash}`);
      spinner.start("⏳ Waiting for transaction receipt...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt?.status === "reverted") {
        throw new Error("An error occurred during contract deployment.");
      }

      const explorerUrl = getExplorerUrl(isTestnet, 'address', receipt.contractAddress!);

      spinner.succeed("📜 Contract deployed successfully!");
      
      if (config.displayPreferences.compactMode) {
        logSuccess(isExternal, `📍 ${receipt.contractAddress}`);
      } else {
        logSuccess(isExternal, `📍 Contract Address: ${receipt.contractAddress}`);
      }

      if (config.displayPreferences.showGasDetails) {
        logInfo(isExternal, `⛽ Gas Used: ${receipt.gasUsed}`);
      }

      if (config.displayPreferences.showBlockDetails) {
        logInfo(isExternal, `📦 Block Number: ${receipt.blockNumber}`);
      }

      if (config.displayPreferences.showExplorerLinks) {
        logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);
      }

      let attestationUID: string | null = null;
      if (params.attestation?.enabled && receipt.contractAddress) {
        const attestationData: DeploymentAttestationData = {
          contractAddress: receipt.contractAddress,
          contractName: extractContractName(params.abiPath),
          deployer: walletClient.account.address,
          blockNumber: Number(receipt.blockNumber),
          transactionHash: hash,
          timestamp: getCurrentTimestamp(),
          abiHash: AttestationService.createHash(abiContent),
          bytecodeHash: AttestationService.createHash(bytecode)
        };

        const result = await handleAttestation('deployment', attestationData, {
          enabled: params.attestation.enabled,
          testnet: params.testnet,
          schemaUID: params.attestation.schemaUID,
          recipient: params.attestation.recipient || receipt.contractAddress,
          isExternal: params.isExternal,
          walletName: params.name,
          walletsData: walletsData,
          password: params.password
        });

        attestationUID = result.uid;
      }

      return {
        success: true,
        data: {
          contractAddress: receipt.contractAddress!,
          transactionHash: hash,
          network: getNetworkName(isTestnet),
          explorerUrl: explorerUrl,
          attestationUID: attestationUID || undefined,
        },
      };
    } catch (error) {
      const errorMessage = "Error during contract deployment, please check the ABI and bytecode files.";
      spinner.fail("Error during contract deployment.");
      return {
        error: errorMessage,
        success: false,
      };
    }
  } catch (error) {
    const errorMessage = "Error deploying contract, please check the ABI and bytecode files.";
    logError(isExternal, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}
