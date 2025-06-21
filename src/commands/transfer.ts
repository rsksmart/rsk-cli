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
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(
        chalk.red("🚫 No saved wallet found. Please create a wallet first.")
      );
      return;
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
    const { address: walletAddress } = wallet;

    if (!walletAddress) {
      console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
      return;
    }

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(name);
    const account = walletClient.account;

    if (!account) {
      console.log(
        chalk.red(
          "⚠️ Failed to retrieve the account. Please ensure your wallet is correctly set up."
        )
      );
      return;
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

      spinner.succeed("✅ Simulation successful, proceeding with transfer...");

      const txHash = await walletClient.writeContract(request);
      console.log(chalk.white(`🔄 Transaction initiated. TxHash:`), chalk.green(txHash));

      spinner.start("⏳ Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      spinner.stop();

      if (receipt.status === "success") {
        console.log(chalk.green("✅ Transfer completed successfully!"));
        console.log(chalk.white(`📦 Block Number: ${receipt.blockNumber}`));
        console.log(chalk.white(`⛽ Gas Used: ${receipt.gasUsed}`));
      } else {
        console.log(chalk.red("❌ Transfer failed."));
      }

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
        : `https://explorer.rootstock.io/tx/${txHash}`;
      console.log(chalk.white(`🔗 View on Explorer:`), chalk.dim(explorerUrl));
    } else {
      // Handle RBTC transfer
      const balance = await publicClient.getBalance({ address: walletAddress });
      const rbtcBalance = Number(balance) / 10 ** 18;

      console.log(chalk.white(`📄 Wallet Address:`), chalk.green(walletAddress));
      console.log(chalk.white(`🎯 Recipient Address:`), chalk.green(toAddress));
      console.log(
        chalk.white(`💵 Amount to Transfer:`),
        chalk.green(`${value} RBTC`)
      );
      console.log(
        chalk.white(`💰 Current Balance:`),
        chalk.green(`${rbtcBalance} RBTC`)
      );

      if (rbtcBalance < value) {
        console.log(
          chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`)
        );
        return;
      }

      const txHash = await walletClient.sendTransaction({
        account: account,
        chain: provider.chain,
        to: toAddress,
        value: BigInt(value * 10 ** 18),
      });

      console.log(
        chalk.white(`🔄 Transaction initiated. TxHash:`),
        chalk.green(txHash)
      );
      const spinner = ora("⏳ Waiting for confirmation...").start();

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      spinner.stop();

      if (receipt.status === "success") {
        console.log(chalk.green("✅ Transaction confirmed successfully!"));
        console.log(
          chalk.white(`📦 Block Number:`),
          chalk.green(receipt.blockNumber)
        );
        console.log(
          chalk.white(`⛽ Gas Used:`),
          chalk.green(receipt.gasUsed.toString())
        );

        const explorerUrl = testnet
          ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
          : `https://explorer.rootstock.io/tx/${txHash}`;
        console.log(
          chalk.white(`🔗 View on Explorer:`),
          chalk.dim(`${explorerUrl}`)
        );
      } else {
        console.log(chalk.red("❌ Transaction failed."));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        chalk.red("🚨 Error during transfer:"),
        chalk.yellow(error.message)
      );
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
