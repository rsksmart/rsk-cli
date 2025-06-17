import fs from "fs-extra";
import chalk from "chalk";
import inquirer from "inquirer";
import { walletFilePath } from "../utils/constants.js";
import { loadWallets } from "../utils/index.js";
import { createPublicClient, http, formatEther } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";

type InfoOptions = {
  wallet?: string;
  testnet?: boolean;
  format?: "json" | "text";
};

export async function walletInfoCommand(options: InfoOptions = {}) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }


    const walletsData = JSON.parse(loadWallets());
    const wallets = walletsData.wallets || {};

    if (Object.keys(wallets).length === 0) {
      console.log(chalk.red("❌ No wallets found."));
      return;
    }

 
    let selectedWallet = options.wallet;
    if (!selectedWallet) {
      const { walletName } = await inquirer.prompt([
        {
          type: "list",
          name: "walletName",
          message: "🔍 Select a wallet to view information:",
          choices: Object.keys(wallets),
        },
      ]);
      selectedWallet = walletName;
    }

    if (!wallets[selectedWallet!]) {
      console.log(chalk.red(`❌ Wallet "${selectedWallet}" not found.`));
      return;
    }

    const walletData = wallets[selectedWallet!];
    const isTestnet = options.testnet || false;
    const chain = isTestnet ? rootstockTestnet : rootstock;

 
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

 
    const balance = await publicClient.getBalance({
      address: walletData.address as `0x${string}`,
    });

 
    const transactionCount = await publicClient.getTransactionCount({
      address: walletData.address as `0x${string}`,
    });

 
    const walletInfo = {
      name: selectedWallet,
      address: walletData.address,
      balance: formatEther(balance),
      transactionCount,
      network: isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet",
      isCurrentWallet: walletsData.currentWallet === selectedWallet,
      backupInfo: walletData._backup || null,
    };

 
    if (options.format === "json") {
      console.log(JSON.stringify(walletInfo, null, 2));
    } else {
      console.log(chalk.green("\n📋 Wallet Information:"));
      console.log(chalk.white("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
      console.log(chalk.blue("Name:"), chalk.white(walletInfo.name));
      console.log(chalk.blue("Address:"), chalk.white(walletInfo.address));
      console.log(chalk.blue("Balance:"), chalk.white(`${walletInfo.balance} RBTC`));
      console.log(chalk.blue("Transaction Count:"), chalk.white(walletInfo.transactionCount));
      console.log(chalk.blue("Network:"), chalk.white(walletInfo.network));
      console.log(chalk.blue("Current Wallet:"), chalk.white(walletInfo.isCurrentWallet ? "Yes" : "No"));
      
      if (walletInfo.backupInfo) {
        console.log(chalk.blue("\n📦 Backup Information:"));
        console.log(chalk.white("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
        console.log(chalk.blue("Backup Date:"), chalk.white(new Date(walletInfo.backupInfo.timestamp).toLocaleString()));
        console.log(chalk.blue("Backup Version:"), chalk.white(walletInfo.backupInfo.version));
      }
    }

  } catch (error: any) {
    console.error(
      chalk.red("🚨 Error retrieving wallet information:"),
      chalk.yellow(error.message)
    );
  }
} 