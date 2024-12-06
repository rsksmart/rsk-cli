import chalk from "chalk";
import fs from "fs";
import { walletFilePath } from "../utils/constants.js";
import inquirer from "inquirer";

type InquirerAnswers = {
  apiKey?: string;
};

export async function historyCommand(testnet: boolean) {
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
    const wallet = wallets[currentWallet];
    const { address: walletAddress } = wallet;

    const apiKeyQuestion: any = [
      {
        type: "password",
        name: "apiKey",
        message: "🔒 Enter Alchemy API key to fetch history:",
        mask: "*",
      },
    ];

    const { apiKey } = await inquirer.prompt<InquirerAnswers>(apiKeyQuestion);

    console.log(
      chalk.blue(`🔍 Fetching transaction history for ${walletAddress} ... `)
    );

    const data = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          fromAddress: walletAddress,
          category: ["external", "erc20", "erc721", "erc1155"],
        },
      ],
    });

    const testnetUrl = `https://rootstock-testnet.g.alchemy.com/v2/${apiKey}`;
    const mainnetUrl = `https://rootstock-mainnet.g.alchemy.com/v2/${apiKey}`;
    const baseURL = testnet ? testnetUrl : mainnetUrl;

    const response = await fetch(baseURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data,
    });

    if (!response.ok) {
      // Check if HTTP response is unsuccessful
      console.error(
        chalk.red(`❌ API request failed with status: ${response.status}`)
      );
      return;
    }

    const result = await response.json();

    // Handle Alchemy-specific errors
    if (result.error) {
      console.error(
        chalk.red(`❌ Error from Alchemy: ${result.error.message}`)
      );
      return;
    }

    // Handle missing or empty transfers
    const transfers = result.result?.transfers;
    if (!transfers || transfers.length === 0) {
      console.log(chalk.yellow("⚠️ No transactions found."));
      return;
    }

    console.log(
      chalk.green("✅ Transaction history fetched successfully:"),
      chalk.blue(JSON.stringify(transfers, null, 2))
    );
  } catch (error: any) {
    console.error(
      chalk.red(`🚨 An unknown error occurred: ${error.message || error}`)
    );
  }
}
