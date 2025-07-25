import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { Address } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";

type TransferCommandOptions = {
  testnet: boolean;
  toAddress: Address;
  value: number;
  name?: string;
  tokenAddress?: Address;
  isExternal?: boolean;
  walletsData?: any;
  password?: string;
};

type TransferResult = {
  success: boolean;
  data?: {
    transactionHash: string;
    from: string;
    to: string;
    amount: string;
    token: string;
    network: string;
    explorerUrl: string;
    gasUsed?: string;
    blockNumber?: string;
  };
  error?: string;
};

function logMessage(
  params: TransferCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: TransferCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: TransferCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: TransferCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: TransferCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: TransferCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: TransferCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

export async function transferCommand(
  params: TransferCommandOptions
): Promise<TransferResult | void> {
  try {
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
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const { currentWallet, wallets } = walletsData;

    let wallet = wallets[currentWallet];

    if (params.name) {
      if (!wallets[params.name]) {
        const errorMessage = "Wallet with the provided name does not exist.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        wallet = wallets[params.name];
      }
    }
    const { address: walletAddress } = wallet;

    if (!walletAddress) {
      const errorMessage = "No valid address found in the saved wallet.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const provider = new ViemProvider(params.testnet);
    const publicClient = await provider.getPublicClient();
    
    let walletClient;
    if (params.isExternal) {
      if (!params.name || !params.password || !params.walletsData) {
        const errorMessage = "Wallet name, password and wallets data are required.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
      walletClient = await provider.getWalletClientExternal(
        params.walletsData,
        params.name,
        params.password,
        provider
      );
    } else {
      walletClient = await provider.getWalletClient(params.name);
    }
    
    if (!walletClient) {
      const errorMessage = "Failed to get wallet client.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const account = walletClient.account;

    if (!account) {
      const errorMessage = "Failed to retrieve the account. Please ensure your wallet is correctly set up.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    logInfo(params, `🔑 Wallet account: ${account.address}`);

    if (params.tokenAddress) {
      // Handle ERC20 token transfer
      const isERC20 = await isERC20Contract(publicClient, params.tokenAddress);
      if (!isERC20) {
        const errorMessage = "The provided address is not a valid ERC20 token contract.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      // Get token information
      const tokenName = await publicClient.readContract({
        address: params.tokenAddress,
        abi: [{
          name: "name",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "string" }]
        }],
        functionName: "name"
      });

      const tokenSymbol = await publicClient.readContract({
        address: params.tokenAddress,
        abi: [{
          name: "symbol",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "string" }]
        }],
        functionName: "symbol"
      });

      // Display token and transfer information
      logInfo(params, `📄 Token Information:`);
      logInfo(params, `     Name: ${tokenName}`);
      logInfo(params, `     Symbol: ${tokenSymbol}`);
      logInfo(params, `     Contract: ${params.tokenAddress}`);
      logInfo(params, `🎯 To Address: ${params.toAddress}`);
      logInfo(params, `💵 Amount to Transfer: ${params.value} ${tokenSymbol}`);

      // Check balance and proceed with transfer
      const { balance } = await getTokenInfo(publicClient, params.tokenAddress, walletAddress);
      const formattedBalance = Number(balance) / 10 ** 18;

      if (formattedBalance < params.value) {
        const errorMessage = `Insufficient balance to transfer ${params.value} tokens.`;
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
      startSpinner(params, spinner, "⏳ Simulating token transfer...");
      
      const { request } = await publicClient.simulateContract({
        account,
        address: params.tokenAddress,
        abi: [{
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" }
          ],
          outputs: [{ type: "bool" }]
        }],
        functionName: "transfer",
        args: [params.toAddress, BigInt(params.value * (10 ** 18))]
      });

      succeedSpinner(params, spinner, "✅ Simulation successful, proceeding with transfer...");

      const txHash = await walletClient.writeContract(request);
      logSuccess(params, `🔄 Transaction initiated. TxHash: ${txHash}`);

      startSpinner(params, spinner, "⏳ Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      stopSpinner(params, spinner);

      const explorerUrl = params.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
        : `https://explorer.rootstock.io/tx/${txHash}`;

      if (receipt.status === "success") {
        logSuccess(params, "✅ Transfer completed successfully!");
        logInfo(params, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(params, `⛽ Gas Used: ${receipt.gasUsed}`);
        logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
        
        return {
          success: true,
          data: {
            transactionHash: txHash,
            from: walletAddress,
            to: params.toAddress,
            amount: `${params.value}`,
            token: tokenSymbol as string,
            network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            explorerUrl,
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber.toString(),
          },
        };
      } else {
        const errorMessage = "Transfer failed.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    } else {
      // Handle RBTC transfer
      const balance = await publicClient.getBalance({ address: walletAddress });
      const rbtcBalance = Number(balance) / 10 ** 18;

      logInfo(params, `📄 Wallet Address: ${walletAddress}`);
      logInfo(params, `🎯 Recipient Address: ${params.toAddress}`);
      logInfo(params, `💵 Amount to Transfer: ${params.value} RBTC`);
      logInfo(params, `💰 Current Balance: ${rbtcBalance} RBTC`);

      if (rbtcBalance < params.value) {
        const errorMessage = `Insufficient balance to transfer ${params.value} RBTC.`;
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const txHash = await walletClient.sendTransaction({
        account: account,
        chain: provider.chain,
        to: params.toAddress,
        value: BigInt(params.value * 10 ** 18),
      });

      logSuccess(params, `🔄 Transaction initiated. TxHash: ${txHash}`);
      
      const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
      startSpinner(params, spinner, "⏳ Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      stopSpinner(params, spinner);

      const explorerUrl = params.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
        : `https://explorer.rootstock.io/tx/${txHash}`;

      if (receipt.status === "success") {
        logSuccess(params, "✅ Transaction confirmed successfully!");
        logInfo(params, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(params, `⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
        
        return {
          success: true,
          data: {
            transactionHash: txHash,
            from: walletAddress,
            to: params.toAddress,
            amount: `${params.value}`,
            token: "RBTC",
            network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            explorerUrl,
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber.toString(),
          },
        };
      } else {
        const errorMessage = "Transaction failed.";
        logError(params, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }
  } catch (error) {
    const errorMessage = "Error during transfer, please check the transfer details.";
    logError(params, errorMessage);
    
    return {
      error: errorMessage,
      success: false,
    };
  }
}
