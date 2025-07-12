import chalk from "chalk";
import fs from "fs";
import inquirer from "inquirer";
import { walletFilePath } from "./constants.js";

export async function getThirdwebApiKey(apiKey?: string): Promise<string> {
  // Check if API key exists in storage or passed as argument
  let storedApiKey = getThirdwebApiKeyFromStorage();

  if (apiKey && !storedApiKey) {
    await writeThirdwebApiKey(apiKey);
  }

  if (!apiKey && !storedApiKey) {
    console.log(
      chalk.yellow(
        "🔑 Thirdweb API key not found. Please provide your API key to continue."
      )
    );
    console.log(
      chalk.blue(
        "You can get an API key at https://thirdweb.com/create-api-key"
      )
    );

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Thirdweb API key:',
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'API key is required';
          }
          return true;
        }
      }
    ]);

    await writeThirdwebApiKey(answers.apiKey);
    return answers.apiKey;
  }

  return apiKey || storedApiKey!;
}

export async function writeThirdwebApiKey(apiKey: string) {
  try {
    // Read the existing wallet file or create new structure
    let walletsData: any = {};
    
    if (fs.existsSync(walletFilePath)) {
      walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    }

    // Add or update the thirdwebApiKey
    walletsData.thirdwebApiKey = apiKey;

    // Write the updated JSON back to the file
    fs.writeFileSync(walletFilePath, JSON.stringify(walletsData, null, 2));

    console.log(chalk.green(`✅ Thirdweb API key saved successfully.`));
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error saving Thirdweb API key:"),
      chalk.yellow(error.message || error)
    );
  }
}

export function getThirdwebApiKeyFromStorage(): string | undefined {
  try {
    if (fs.existsSync(walletFilePath)) {
      const configData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      return configData.thirdwebApiKey;
    }
    return undefined;
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error reading Thirdweb API key:"),
      chalk.yellow(error.message || error)
    );
  }
}

export function getPrivateKeyFromStorage(): string | undefined {
  try {
    if (fs.existsSync(walletFilePath)) {
      const configData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      return configData.privateKey;
    }
    return undefined;
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error reading private key:"),
      chalk.yellow(error.message || error)
    );
  }
}

export async function getPrivateKey(privateKey?: string): Promise<string> {
  // Check if private key exists in storage or passed as argument
  let storedPrivateKey = getPrivateKeyFromStorage();

  if (privateKey && !storedPrivateKey) {
    // Always store without 0x prefix
    const normalized = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    await writePrivateKey(normalized);
  }

  if (!privateKey && !storedPrivateKey) {
    console.log(
      chalk.yellow(
        "🔑 Private key not found. Please provide your private key to continue."
      )
    );

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'privateKey',
        message: 'Enter your private key:',
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Private key is required';
          }
          // Accept 0x-prefixed or non-prefixed 64-char hex
          const hex = input.startsWith('0x') ? input.slice(2) : input;
          if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
            return 'Private key must be a 32-byte hex string (64 hex chars, with or without 0x)';
          }
          return true;
        }
      }
    ]);

    // Always store without 0x prefix
    const normalized = answers.privateKey.startsWith('0x') ? answers.privateKey.slice(2) : answers.privateKey;
    await writePrivateKey(normalized);
    return normalized;
  }

  // Always return without 0x prefix
  if (privateKey) {
    return privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  }
  return storedPrivateKey!;
}

export async function writePrivateKey(privateKey: string) {
  try {
    // Read the existing wallet file or create new structure
    let walletsData: any = {};
    
    if (fs.existsSync(walletFilePath)) {
      walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    }

    // Always store without 0x prefix
    walletsData.privateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    // Write the updated JSON back to the file
    fs.writeFileSync(walletFilePath, JSON.stringify(walletsData, null, 2));

    console.log(chalk.green(`✅ Private key saved successfully.`));
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error saving private key:"),
      chalk.yellow(error.message || error)
    );
  }
} 