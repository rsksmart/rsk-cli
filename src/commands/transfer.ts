import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { Address, erc721Abi } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { TokenStandard, getTokenInfo, transferToken } from "../utils/tokenStandards.js";
import inquirer from "inquirer";

export async function transferCommand(
  testnet: boolean,
  toAddress: Address,
  value: number,
  name?: string,
  tokenAddress?: Address,
  tokenId?: bigint
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

    if (name) {
      if (!wallets[name]) {
        console.log(
          chalk.red("⚠️ Wallet with the provided name does not exist.")
        );
        throw new Error();
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

    if (tokenAddress) {
      // Get token information and standard
      const tokenInfo = await getTokenInfo(publicClient, tokenAddress, walletAddress);
      
      // Display token information
      console.log(chalk.white(`📄 Token Information:`));
      console.log(chalk.white(`     Name: ${tokenInfo.name}`));
      console.log(chalk.white(`     Symbol: ${tokenInfo.symbol}`));
      console.log(chalk.white(`     Standard: ${tokenInfo.standard}`));
      console.log(chalk.white(`     Contract: ${tokenAddress}`));
      console.log(chalk.white(`🎯 To Address: ${toAddress}`));

      if (tokenInfo.standard === TokenStandard.ERC721) {
        if (!tokenId) {
          // If no tokenId provided, ask user to select one
          const ownedTokens = await publicClient.readContract({
            address: tokenAddress,
            abi: [{
              name: "tokenOfOwnerByIndex",
              type: "function",
              stateMutability: "view",
              inputs: [
                { name: "owner", type: "address" },
                { name: "index", type: "uint256" }
              ],
              outputs: [{ type: "uint256" }]
            }],
            functionName: "tokenOfOwnerByIndex",
            args: [walletAddress, BigInt(0)]
          });

          const { selectedTokenId } = await inquirer.prompt({
            type: "input",
            name: "selectedTokenId",
            message: "Enter the token ID to transfer:",
            validate: (input) => {
              const id = BigInt(input);
              return id > BigInt(0) ? true : "Please enter a valid token ID";
            }
          });

          tokenId = BigInt(selectedTokenId);
        }

        const spinnerOwnership = ora("⏳ Verifying token ownership...").start();
        try {
          const ownerOfToken = await publicClient.readContract({
            address: tokenAddress,
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [tokenId],
          });

          if (String(ownerOfToken).toLowerCase() !== walletAddress.toLowerCase()) {
            spinnerOwnership.fail(
              `You do not own the token with ID ${tokenId}.`
            );
            console.log(chalk.white(`   Current owner: ${ownerOfToken}`));
            return;
          }
          spinnerOwnership.succeed("✅ Token ownership verified.");
        } catch (error) {
          spinnerOwnership.fail(
            "Could not verify token ownership. The token may not exist or the contract is not a valid ERC-721."
          );
          return;
        }

        console.log(chalk.white(`🖼️ Token ID: ${tokenId}`));
      } else {
        console.log(chalk.white(`💵 Amount to Transfer: ${value} ${tokenInfo.symbol}`));
      }

      // Check balance
      const formattedBalance = tokenInfo.standard === TokenStandard.ERC20
        ? Number(tokenInfo.balance) / (10 ** (tokenInfo.decimals || 18))
        : Number(tokenInfo.balance);

      if (tokenInfo.standard === TokenStandard.ERC20 && formattedBalance < value) {
        console.log(chalk.red(`🚫 Insufficient balance to transfer ${value} tokens.`));
        return;
      }

      const spinner = ora("⏳ Simulating token transfer...").start();

      // Prepare transfer value
      const transferValue = tokenInfo.standard === TokenStandard.ERC20
        ? BigInt(value * (10 ** (tokenInfo.decimals || 18)))
        : BigInt(0);

      const { request } = await transferToken(
        publicClient,
        tokenAddress,
        toAddress,
        transferValue,
        tokenId,
        walletAddress
      );

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
