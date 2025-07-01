import chalk from "chalk";
import fs from "fs";
import { walletFilePath } from "../utils/constants.js";

type HistoryCommandOptions = {
  testnet: boolean;
  apiKey?: string;
  number?: string;
  isExternal?: boolean;
  walletsData?: any;
};

type HistoryResult = {
  success: boolean;
  data?: {
    walletAddress: string;
    network: string;
    transfers: any[];
    totalTransfers: number;
  };
  error?: string;
};

function logMessage(
  params: HistoryCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: HistoryCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: HistoryCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: HistoryCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function logWarning(params: HistoryCommandOptions, message: string) {
  logMessage(params, message, chalk.yellow);
}

export async function historyCommand(
  params: HistoryCommandOptions
): Promise<HistoryResult | void> {
  try {
    // Check if API key exists in storage or passed as argument
    let apiKeyFromStorage = getApiKeyFromStorage();
    let finalApiKey = params.apiKey || apiKeyFromStorage;
    if (!params.isExternal && params.apiKey && !apiKeyFromStorage) {
      await writeApiKey(params.apiKey);
    }

    if (!finalApiKey) {
      const errorMessage = "🔑 Add the Alchemy API key as a parameter in the command. Provide it once, and it will be securely saved for future use.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }


    let walletsData;
    if (params.isExternal && params.walletsData) {
      walletsData = params.walletsData;
    } else {
      if (!fs.existsSync(walletFilePath)) {
        const errorMessage = "No saved wallet found. Please create a wallet first.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
      walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    }

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "⚠️ No valid wallet found. Please create or import a wallet first.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const { currentWallet, wallets } = walletsData;
    const wallet = wallets[currentWallet];
    const { address: walletAddress } = wallet;

    logInfo(params, `🔍 Fetching transaction history on Rootstock ${params.testnet ? "Testnet" : "Mainnet"} for ${walletAddress}...`);

    const data = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          fromAddress: walletAddress,
          category: ["external", "erc20", "erc721", "erc1155"],
          withMetadata: true,
        },
      ],
    });

    const testnetUrl = `https://rootstock-testnet.g.alchemy.com/v2/${finalApiKey}`;
    const mainnetUrl = `https://rootstock-mainnet.g.alchemy.com/v2/${finalApiKey}`;
    const baseURL = params.testnet ? testnetUrl : mainnetUrl;

    const response = await fetch(baseURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data,
    });

    if (!response.ok) {
      const errorMessage = `API request failed with status: ${response.status}`;
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const result = await response.json();

    // Handle Alchemy-specific errors
    if (result.error) {
      const errorMessage = `Error from Alchemy: ${result.error.message}`;
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    let transfers = result.result?.transfers;

    if (!transfers || transfers.length === 0) {
      const errorMessage = "⚠️ No transactions found.";
      logWarning(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const totalTransfers = transfers.length;
    
    if (params.number) {
      transfers = transfers.slice(0, parseInt(params.number));
    }

    if (!params.isExternal) {
      for (const transfer of transfers) {
        logSuccess(params, "✅ Transfer:");
        logInfo(params, `   From: ${transfer.from}`);
        logInfo(params, `   To: ${transfer.to}`);
        logInfo(params, `   Token: ${transfer.asset || "N/A"}`);
        logInfo(params, `   Value: ${transfer.value || "N/A"}`);
        logInfo(params, `   Tx Hash: ${transfer.hash}`);
        logInfo(params, `   Time: ${new Date(transfer.metadata.blockTimestamp)}`);
      }
    }

    return {
      success: true,
      data: {
        walletAddress,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        transfers,
        totalTransfers,
      },
    };
  } catch (error: any) {
    const errorMessage = `An unknown error occurred: ${error.message || error}`;
    logError(params, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}

async function writeApiKey(apiKey: string) {
  try {
    // Read the existing wallet file
    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    // Add or update the alchemyApiKey
    walletsData.alchemyApiKey = apiKey;

    // Write the updated JSON back to the file
    fs.writeFileSync(walletFilePath, JSON.stringify(walletsData, null, 2));

  } catch (error: any) {
    throw new Error(`Error updating Alchemy API key: ${error.message || error}`);
  }
}

function getApiKeyFromStorage(): string | undefined {
  try {
    if (fs.existsSync(walletFilePath)) {
      const configData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      return configData.alchemyApiKey;
    }
    return undefined;
  } catch (error: any) {
    throw new Error(`Error reading alchemy API key: ${error.message || error}`);
  }
}
