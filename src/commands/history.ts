import chalk from "chalk";
import fs from "fs";
import { walletFilePath } from "../utils/constants.js";

export async function historyCommand(
  testnet: boolean,
  apiKey: string,
  number: string
) {
  try {
    // Check if API key exists in storage or passed as argument
    let storedApiKey = getApiKeyFromStorage();

    if (apiKey && !storedApiKey) {
      await writeApiKey(apiKey);
    }

    if (!apiKey && !storedApiKey) {
      console.log(
        chalk.red(
          "🔑 Add the Alchemy API key as a parameter in the command. Provide it once, and it will be securely saved for future use."
        )
      );
      return;
    }

    const finalApiKey = apiKey || storedApiKey;

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

    console.log(
      chalk.blue(
        `🔍 Fetching transaction history on Rootstock ${
          testnet ? "Testnet" : "Mainnet"
        } for ${walletAddress} ... `
      )
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
          withMetadata: true,
        },
      ],
    });

    const testnetUrl = `https://rootstock-testnet.g.alchemy.com/v2/${finalApiKey}`;
    const mainnetUrl = `https://rootstock-mainnet.g.alchemy.com/v2/${finalApiKey}`;
    const baseURL = testnet ? testnetUrl : mainnetUrl;

    const response = await fetch(baseURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data,
    });

    if (!response.ok) {
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

    let transfers = result.result?.transfers;

    if (!transfers || transfers.length === 0) {
      console.log(chalk.yellow("⚠️ No transactions found."));
      return;
    }

    if (number) {
      transfers = transfers.slice(0, parseInt(number));
    }
    for (const transfer of transfers) {
      console.log(chalk.green(`✅ Transfer:`));
      console.log(`   From: ${transfer.from}`);
      console.log(`   To: ${transfer.to}`);
      console.log(`   Token: ${transfer.asset || "N/A"}`);
      console.log(`   Value: ${transfer.value || "N/A"}`);
      console.log(`   Tx Hash: ${transfer.hash}`);
      console.log(`   Time: ${new Date(transfer.metadata.blockTimestamp)}`);
    }
  } catch (error: any) {
    console.error(
      chalk.red(`🚨 An unknown error occurred: ${error.message || error}`)
    );
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

    console.log(chalk.green(`✅ Alchemy API key updated successfully.`));
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error updating Alchemy API key:"),
      chalk.yellow(error.message || error)
    );
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
    console.error(
      chalk.red("❌ Error reading alchemy API key:"),
      chalk.yellow(error.message || error)
    );
  }
}
