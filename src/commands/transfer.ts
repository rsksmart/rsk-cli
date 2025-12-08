import ViemProvider from "../utils/viemProvider.js";
import fs from "fs";
import { Address } from "viem";
import { walletFilePath, getExplorerUrl, getNetworkName, getCurrentTimestamp, WEI_MULTIPLIER } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import { TransferAttestationData } from "../utils/attestation.js";
import { handleAttestation } from "../utils/attestationHandler.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type TransferCommandOptions = {
  testnet: boolean;
  toAddress: Address;
  value: number;
  name?: string;
  tokenAddress?: Address;
  isExternal?: boolean;
  walletsData?: any;
  password?: string;
  attestation?: {
    enabled: boolean;
    schemaUID?: string;
    recipient?: string;
    reason?: string;
  };
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
    attestationUID?: string;
  };
  error?: string;
};

export async function transferCommand(
  params: TransferCommandOptions
): Promise<TransferResult | void> {
  const isExternal = params.isExternal || false;

  try {
    let walletsData;
    if (params.isExternal && params.walletsData) {
      walletsData = params.walletsData;
    } else {
      if (!fs.existsSync(walletFilePath)) {
        const errorMessage = "No saved wallet found. Please create a wallet first.";
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
      walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    }

    if (!walletsData.currentWallet || !walletsData.wallets) {
      const errorMessage = "No valid wallet found. Please create or import a wallet first.";
      logError(isExternal, errorMessage);
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
        logError(isExternal, errorMessage);
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
      logError(isExternal, errorMessage);
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
        logError(isExternal, errorMessage);
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
      logError(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const account = walletClient.account;

    if (!account) {
      const errorMessage = "Failed to retrieve the account. Please ensure your wallet is correctly set up.";
      logError(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    logInfo(isExternal, `🔑 Wallet account: ${account.address}`);

    if (params.tokenAddress) {
      const isERC20 = await isERC20Contract(publicClient, params.tokenAddress);
      if (!isERC20) {
        const errorMessage = "The provided address is not a valid ERC20 token contract.";
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

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

      logInfo(isExternal, `📄 Token Information:`);
      logInfo(isExternal, `     Name: ${tokenName}`);
      logInfo(isExternal, `     Symbol: ${tokenSymbol}`);
      logInfo(isExternal, `     Contract: ${params.tokenAddress}`);
      logInfo(isExternal, `🎯 To Address: ${params.toAddress}`);
      logInfo(isExternal, `💵 Amount to Transfer: ${params.value} ${tokenSymbol}`);

      const { balance } = await getTokenInfo(publicClient, params.tokenAddress, walletAddress);
      const formattedBalance = Number(balance) / WEI_MULTIPLIER;

      if (formattedBalance < params.value) {
        const errorMessage = `Insufficient balance to transfer ${params.value} tokens.`;
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const spinner = createSpinner(isExternal);
      spinner.start("⏳ Simulating token transfer...");

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
        args: [params.toAddress, BigInt(params.value * WEI_MULTIPLIER)]
      });

      spinner.succeed("✅ Simulation successful, proceeding with transfer...");

      const txHash = await walletClient.writeContract(request);
      logSuccess(isExternal, `🔄 Transaction initiated. TxHash: ${txHash}`);

      spinner.start("⏳ Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      spinner.stop();

      const explorerUrl = getExplorerUrl(params.testnet, 'tx', txHash);

      if (receipt.status === "success") {
        logSuccess(isExternal, "✅ Transfer completed successfully!");
        logInfo(isExternal, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(isExternal, `⛽ Gas Used: ${receipt.gasUsed}`);
        logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);
        
        let attestationUID: string | null = null;
        if (params.attestation?.enabled) {
          const attestationData: TransferAttestationData = {
            sender: walletAddress,
            recipient: params.toAddress,
            amount: `${params.value}`,
            tokenAddress: params.tokenAddress,
            tokenSymbol: tokenSymbol as string,
            transactionHash: txHash,
            blockNumber: Number(receipt.blockNumber),
            timestamp: getCurrentTimestamp(),
            reason: params.attestation.reason || "",
            transferType: "ERC20"
          };

          const result = await handleAttestation('transfer', attestationData, {
            enabled: params.attestation.enabled,
            testnet: params.testnet,
            schemaUID: params.attestation.schemaUID,
            recipient: params.attestation.recipient || params.toAddress,
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
            transactionHash: txHash,
            from: walletAddress,
            to: params.toAddress,
            amount: `${params.value}`,
            token: tokenSymbol as string,
            network: getNetworkName(params.testnet),
            explorerUrl,
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber.toString(),
            attestationUID: attestationUID || undefined,
          },
        };
      } else {
        const errorMessage = "Transfer failed.";
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    } else {
      const balance = await publicClient.getBalance({ address: walletAddress });
      const rbtcBalance = Number(balance) / WEI_MULTIPLIER;

      logInfo(isExternal, `📄 Wallet Address: ${walletAddress}`);
      logInfo(isExternal, `🎯 Recipient Address: ${params.toAddress}`);
      logInfo(isExternal, `💵 Amount to Transfer: ${params.value} RBTC`);
      logInfo(isExternal, `💰 Current Balance: ${rbtcBalance} RBTC`);

      if (rbtcBalance < params.value) {
        const errorMessage = `Insufficient balance to transfer ${params.value} RBTC.`;
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }

      const txHash = await walletClient.sendTransaction({
        account: account,
        chain: provider.chain,
        to: params.toAddress,
        value: BigInt(params.value * WEI_MULTIPLIER),
      });

      logSuccess(isExternal, `🔄 Transaction initiated. TxHash: ${txHash}`);

      const spinner = createSpinner(isExternal);
      spinner.start("⏳ Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      spinner.stop();

      const explorerUrl = getExplorerUrl(params.testnet, 'tx', txHash);

      if (receipt.status === "success") {
        logSuccess(isExternal, "✅ Transaction confirmed successfully!");
        logInfo(isExternal, `📦 Block Number: ${receipt.blockNumber}`);
        logInfo(isExternal, `⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);
        
        let attestationUID: string | null = null;
        if (params.attestation?.enabled) {
          const attestationData: TransferAttestationData = {
            sender: walletAddress,
            recipient: params.toAddress,
            amount: `${params.value}`,
            tokenAddress: undefined,
            tokenSymbol: "RBTC",
            transactionHash: txHash,
            blockNumber: Number(receipt.blockNumber),
            timestamp: getCurrentTimestamp(),
            reason: params.attestation.reason || "",
            transferType: "RBTC"
          };

          const result = await handleAttestation('transfer', attestationData, {
            enabled: params.attestation.enabled,
            testnet: params.testnet,
            schemaUID: params.attestation.schemaUID,
            recipient: params.attestation.recipient || params.toAddress,
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
            transactionHash: txHash,
            from: walletAddress,
            to: params.toAddress,
            amount: `${params.value}`,
            token: "RBTC",
            network: getNetworkName(params.testnet),
            explorerUrl,
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber.toString(),
            attestationUID: attestationUID || undefined,
          },
        };
      } else {
        const errorMessage = "Transaction failed.";
        logError(isExternal, errorMessage);
        return {
          error: errorMessage,
          success: false,
        };
      }
    }
  } catch (error) {
    const errorMessage = "Error during transfer, please check the transfer details.";
    logError(isExternal, errorMessage);
    
    return {
      error: errorMessage,
      success: false,
    };
  }
}
