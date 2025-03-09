import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { Address } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import ViemProvider from "../utils/viemProvider.js";
import { formatUnits } from "viem";

export async function transferTokenCommand(
  testnet: boolean,
  tokenAddress: Address,
  toAddress: Address,
  value: number,
  walletName?: string
) {
  try {
    const spinner = ora();
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    if (!walletsData.currentWallet || !walletsData.wallets) {
      console.log(chalk.red("⚠️ No valid wallet found. Please create or import a wallet first."));
      return;
    }

    const { currentWallet, wallets } = walletsData;
    let wallet = wallets[currentWallet];

    if (walletName) {
      if (!wallets[walletName]) {
        console.log(chalk.red("⚠️ Wallet with the provided name does not exist."));
        return;
      } else {
        wallet = wallets[walletName];
      }
    }

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(wallet.privateKey);
    const account = walletClient.account;

    console.log(chalk.blue(`🔑 Wallet account: ${account?.address}`));

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
    const { balance } = await getTokenInfo(publicClient, tokenAddress, wallet.address);
    const formattedBalance = Number(balance) / 10 ** 18;

    if (formattedBalance < value) {
      console.log(chalk.red(`🚫 Insufficient balance to transfer ${value} tokens.`));
      return;
    }

    spinner.start(`⏳ Simulating token transfer...`);

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
      args: [toAddress, BigInt(value * (10 ** 18))]
    });

    spinner.succeed(`✅ Simulation successful, proceeding with transfer...`);

    const hash = await walletClient.writeContract(request);

    console.log(chalk.white(`🔄 Transaction initiated. TxHash:`), chalk.green(hash));

    spinner.start("⏳ Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    spinner.stop();

    if (receipt.status === "success") {
      console.log(chalk.green("✅ Transfer completed successfully!"));
      console.log(chalk.white(`📦 Block Number: ${receipt.blockNumber}`));
      console.log(chalk.white(`⛽ Gas Used: ${receipt.gasUsed}`));
    } else {
      console.log(chalk.red("❌ Transfer failed."));
    }

    const explorerUrl = testnet
      ? `https://explorer.testnet.rootstock.io/tx/${hash}`
      : `https://explorer.rootstock.io/tx/${hash}`;
    console.log(chalk.white(`🔗 View on Explorer:`), chalk.dim(explorerUrl));
    console.log(chalk.white(`✨  Done in ${process.uptime().toFixed(2)}s.`));

  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log(chalk.red(`🚫 Error: ${error.message}`));
    } else {
      console.log(chalk.red('🚫 An unknown error occurred'));
    }
  }
}