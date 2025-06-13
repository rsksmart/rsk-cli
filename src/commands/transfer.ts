import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { Address } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";

export async function transferCommand(
  testnet: boolean,
  toAddress: Address,
  value: number,
  name?: string,
  tokenAddress?: Address,
  options?: {
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    data?: `0x${string}`;
  }
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
      // Handle ERC20 token transfer
      const isERC20 = await isERC20Contract(publicClient, tokenAddress);
      if (!isERC20) {
        console.log(chalk.red("🚫 The provided address is not a valid ERC20 token contract."));
        return;
      }

      // Get token information
      const tokenName = await publicClient.readContract({
        address: tokenAddress,
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
        address: tokenAddress,
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
      console.log(chalk.white(`📄 Token Information:`));
      console.log(chalk.white(`     Name: ${tokenName}`));
      console.log(chalk.white(`     Symbol: ${tokenSymbol}`));
      console.log(chalk.white(`     Contract: ${tokenAddress}`));
      console.log(chalk.white(`🎯 To Address: ${toAddress}`));
      console.log(chalk.white(`💵 Amount to Transfer: ${value} ${tokenSymbol}`));

      // Check balance and proceed with transfer
      const { balance } = await getTokenInfo(publicClient, tokenAddress, walletAddress);
      const formattedBalance = Number(balance) / 10 ** 18;

      if (formattedBalance < value) {
        console.log(chalk.red(`🚫 Insufficient balance to transfer ${value} tokens.`));
        return;
      }

      const spinner = ora("⏳ Simulating token transfer...").start();
      const { request } = await publicClient.simulateContract({
        account,
        address: tokenAddress,
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
        args: [toAddress, BigInt(value * (10 ** 18))],
        ...options
      });

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
        ...options
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
