import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import chalk from "chalk";
import inquirer from "inquirer";
import fs from "fs-extra";
import crypto from "crypto";
import { loadWallets } from "../utils/index.js";
import { walletFilePath } from "../utils/constants.js";
import path from "path";
import { addressBookCommand } from "./addressbook.js";
import { WalletData, WalletItem } from "../utils/types.js";
import zxcvbn from "zxcvbn";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";

interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  entropy: number;
  score: number;
  crackTime: string;
}

const CONFIG = {
  minLength: 6,
  maxLength: 128,
  minScore: 3,
};

/**
 * Validates password using zxcvbn library
 */
function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  if (password.length < CONFIG.minLength) {
    errors.push(`Password must be at least ${CONFIG.minLength} characters long`);
  }
  
  if (password.length > CONFIG.maxLength) {
    errors.push(`Password must be no more than ${CONFIG.maxLength} characters long`);
  }
  
  const result = zxcvbn(password);
  
  if (result.score < CONFIG.minScore) {
    const scoreLabels = [
      "too guessable (risky password)",
      "very guessable (protection from throttled online attacks)",
      "somewhat guessable (protection from unthrottled online attacks)",
      "safely unguessable (moderate protection from offline attacks)",
      "very unguessable (strong protection from offline attacks)"
    ];
    
    errors.push(`Password strength: ${scoreLabels[result.score]} - score ${result.score}/4 (minimum required: ${CONFIG.minScore}/4)`);
    
    if (result.feedback.warning) {
      errors.push(`⚠️  Warning: ${result.feedback.warning}`);
    }
    
    if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
      result.feedback.suggestions.forEach((suggestion: string) => {
        errors.push(`💡 Suggestion: ${suggestion}`);
      });
    }
  }
  const entropy = Math.log2(result.guesses);
  const crackTime = String(result.crack_times_display.offline_fast_hashing_1e10_per_second);
  
  return {
    isValid: errors.length === 0,
    errors,
    entropy,
    score: result.score,
    crackTime
  };
}

type InquirerAnswers = {
  action?: string;
  password?: string;
  saveWallet?: boolean;
  walletName?: string;
  privateKey?: string;
  address?: string;
  setCurrentWallet?: boolean;
  confirmDelete?: boolean;
  newWalletName?: string;
  backupPath?: string;
};
type WalletCommandOptions = {
  isExternal?: boolean;
  action?: string | undefined;
  password?: string | undefined;
  walletsData?: WalletData | undefined;
  newWalletName?: string | undefined;
  replaceCurrentWallet?: boolean;
  pk?: string | undefined;
  newMainWallet?: string | undefined;
  previousWallet?: string | undefined;
  deleteWalletName?: string | undefined;
};

export const createWalletOptions = [
  "🆕 Create a new wallet",
  "🔑 Import existing wallet",
  "🔍 List saved wallets",
  "🔁 Switch wallet",
  "📝 Update wallet name",
  "📂 Backup wallet data",
  "❌ Delete wallet",
  "📖 Address Book",
] as const;

function getWalletsData(params: WalletCommandOptions): WalletData {
  return params.walletsData && params.isExternal
    ? params.walletsData
    : JSON.parse(loadWallets());
}

function encryptPrivateKey(
  privateKey: string,
  password: string
): {
  encryptedPrivateKey: string;
  iv: string;
} {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, Uint8Array.from(iv), 32);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Uint8Array.from(key),
    Uint8Array.from(iv)
  );

  let encrypted = cipher.update(privateKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encryptedPrivateKey: encrypted,
    iv: iv.toString("hex"),
  };
}

export async function walletCommand(params: WalletCommandOptions = {}) {
  try {
    if (!params.action && fs.existsSync(walletFilePath)) {
      logInfo(params.isExternal || false, "📁 Wallet data file found.");

      const walletsDataString = loadWallets();

      if (walletsDataString) {
        const walletsData = JSON.parse(walletsDataString);

        if (walletsData.currentWallet) {
          logWarning(params.isExternal || false, `\n🔑 Current wallet: ${walletsData.currentWallet}`);
        }
      }
    }
    if (params.action && !params.password) {
      return {
        error:
          "Password is required to import an existing wallet, when using in external mode.",
        success: false,
      };
    }
    let runOption: string | undefined = params.action;
    if (!params.action) {
      const questions: any = [
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: createWalletOptions,
        },
      ];

      const { action } = await inquirer.prompt<InquirerAnswers>(questions);
      runOption = action;
    }
    return await processOption({
      ...params,
      action: runOption,
    });
  } catch (error: any) {
    logError(false, `Error creating or managing wallets: ${error.message || error}`);
  }
}

export async function processOption(params: WalletCommandOptions) {
  switch (params.action) {
    case "🆕 Create a new wallet": {
      const privateKey: string = generatePrivateKey();
      const prefixedPrivateKey: `0x${string}` = `0x${privateKey.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);

      const existingWalletsData: any = getWalletsData(params);

      const passwordResult = await createPassword(
        params.isExternal ?? false,
        params.password
      );

      if (!passwordResult.success) {
        return {
          error: passwordResult.error || "Error creating wallet, password required contains an error.",
          success: false,
        };
      }

      const finalPassword = passwordResult.password;

      if (!finalPassword) {
        return {
          error: "No valid password received.",
          success: false,
        };
      }

      const { encryptedPrivateKey, iv } = encryptPrivateKey(
        prefixedPrivateKey,
        finalPassword
      );

      let finalWalletName = params.newWalletName;
      if (!finalWalletName) {
        const walletNameQuestion: any = [
          {
            type: "input",
            name: "walletName",
            message: "🖋️ Enter a name for your wallet:",
          },
        ];

        const { walletName } = await inquirer.prompt<InquirerAnswers>(
          walletNameQuestion
        );

        if (existingWalletsData.wallets[walletName!]) {
          logError(params.isExternal || false, `Wallet named ${walletName} already exists.`);
          return {
            error: `Wallet named ${walletName} already exists.`,
            success: false,
          };
        }
        finalWalletName = walletName;
      }

      if (!finalWalletName) {
        logError(params.isExternal || false, "No wallet name provided.");
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv,
      };

      return await saveWalletData(
        existingWalletsData,
        params.isExternal ?? false,
        params.replaceCurrentWallet ?? false,
        finalWalletName,
        walletData,
        finalPassword
      );
    }
    case "🔑 Import existing wallet": {
      const existingWalletsData: any = getWalletsData(params);

      let prefixedPrivateKey: `0x${string}`;

      if (!params.isExternal && !params.pk) {
        const inputQuestions: any = [
          {
            type: "password",
            name: "privateKey",
            message: "🔑 Enter your private key:",
            mask: "*",
          },
        ];
        const { privateKey } = await inquirer.prompt<InquirerAnswers>(
          inputQuestions
        );
        prefixedPrivateKey = `0x${privateKey!.replace(
          /^0x/,
          ""
        )}` as `0x${string}`;
      } else {
        prefixedPrivateKey = `0x${params.pk!.replace(
          /^0x/,
          ""
        )}` as `0x${string}`;
      }

      const account = privateKeyToAccount(prefixedPrivateKey);

      if (
        Object.values(existingWalletsData.wallets).some(
          (wallet: any) => wallet.address === account.address
        )
      ) {
        logError(
          params.isExternal || false,
          `Wallet with address ${account.address} already saved.`
        );
        return {
          error: `Wallet with address ${account.address} already saved.`,
          success: false,
        };
      }
      let finalWalletName = params.newWalletName;
      if (!params.isExternal) {
        const walletNameQuestion: any = [
          {
            type: "input",
            name: "walletName",
            message: "🖋️ Enter a name for your wallet:",
          },
        ];

        const { walletName } = await inquirer.prompt<InquirerAnswers>(
          walletNameQuestion
        );
        finalWalletName = walletName;
      }
      if (!finalWalletName) {
        logError(params.isExternal || false, "No wallet name provided.");
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      if (existingWalletsData.wallets[finalWalletName]) {
        logError(params.isExternal || false, `Wallet named ${finalWalletName} already exists.`);
        return {
          error: `Wallet named ${finalWalletName} already exists.`,
          success: false,
        };
      }
      let finalPassword: string | undefined = params.password;
      if (!params.isExternal) {
        logInfo(params.isExternal || false, "🔐 Password Requirements:");
        logInfo(params.isExternal || false, `• At least ${CONFIG.minLength} characters long`);
        logInfo(params.isExternal || false, `• At most ${CONFIG.maxLength} characters long`);
        logInfo(params.isExternal || false, 'Use a strong password with a mix of uppercase and lowercase letters, numbers, and special characters.');

        let isValidPassword = false;
        while (!isValidPassword) {
          const passwordQuestion: any = [
            {
              type: "password",
              name: "password",
              message: "🔒 Enter a secure password to encrypt your wallet:",
              mask: "*",
            },
          ];

          const { password } = await inquirer.prompt<InquirerAnswers>(
            passwordQuestion
          );
          
          if (!password) {
            logError(params.isExternal || false, "❌ Password cannot be empty. Please try again.");
            continue;
          }

          const validation = validatePassword(password);
          
          if (validation.isValid) {
            logSuccess(params.isExternal || false, "✅ Password is secure!");
            finalPassword = password;
            isValidPassword = true;
          } else {
            logError(params.isExternal || false, "❌ Password validation failed:");
            validation.errors.forEach(error => {
              logError(params.isExternal || false, `   ${error}`);
            });
            logWarning(params.isExternal || false, "Please try again with a stronger password.\n");
          }
        }
      } else {
        if (params.password) {
          const validation = validatePassword(params.password);
          if (!validation.isValid) {
            const errorMessage = `Password validation failed: ${validation.errors.join("; ")}`;
            return {
              error: errorMessage,
              success: false,
            };
          }
        }
      }

      if (!finalPassword) {
        logError(params.isExternal || false, "No password provided.");
        return {
          error: "Error creating wallet, password required contains an error.",
          success: false,
        };
      }

      const { encryptedPrivateKey, iv } = encryptPrivateKey(
        prefixedPrivateKey,
        finalPassword
      );

      if (existingWalletsData?.currentWallet) {
        let finalCurrentWallet: boolean = params.replaceCurrentWallet ?? false;
        if (!params.isExternal) {
          const setCurrentWalletQuestion: any = [
            {
              type: "confirm",
              name: "setCurrentWallet",
              message: "🔍 Would you like to set this as the current wallet?",
              default: true,
            },
          ];

          const { setCurrentWallet } = await inquirer.prompt<InquirerAnswers>(
            setCurrentWalletQuestion
          );
          finalCurrentWallet = setCurrentWallet ?? false;
        }

        if (finalCurrentWallet) {
          existingWalletsData.currentWallet = finalWalletName;
          logSuccess(params.isExternal || false, "✅ Wallet set as current!");
        }
      } else {
        existingWalletsData.currentWallet = finalWalletName;
      }

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv,
      };

      existingWalletsData.wallets[finalWalletName] = walletData;

      if (!params.isExternal) {
        logSuccess(params.isExternal || false, "✅ Wallet validated successfully!");
        logInfo(params.isExternal || false, "📄 Address:");
        logInfo(params.isExternal || false, `${chalk.bold(account.address)}`);
        writeWalletData(walletFilePath, existingWalletsData);
      }
      return {
        success: true,
        message: "Wallet imported successfully",
        walletsData: existingWalletsData,
      };
    }
    case "🔍 List saved wallets": {
      const existingWalletsData: any = getWalletsData(params);

      const walletCount = Object.keys(existingWalletsData.wallets).length;

      if (walletCount === 0) {
        logError(params.isExternal || false, "No wallets found.");
        return {
          error: "No wallets found.",
          success: false,
        };
      }

      logSuccess(params.isExternal || false, `📜 Saved wallets (${walletCount}):`);
      Object.keys(existingWalletsData.wallets).forEach((walletName) => {
        logInfo(
          params.isExternal || false,
          `- ${walletName}: ${existingWalletsData.wallets[walletName].address}`
        );
      });

      if (existingWalletsData.currentWallet) {
        logWarning(
          params.isExternal || false,
          `\n🔑 Current wallet: ${existingWalletsData.currentWallet}`
        );
      }
      return {
        success: true,
        message: "Wallets listed successfully",
        walletsData: existingWalletsData,
      };
    }
    case "🔁 Switch wallet": {
      const existingWalletsData: any = getWalletsData(params);

      const walletNames = Object.keys(existingWalletsData.wallets);

      const otherWallets = walletNames.filter(
        (walletName) => walletName !== existingWalletsData.currentWallet
      );

      if (otherWallets.length === 0) {
        logError(params.isExternal || false, "No other wallets available to switch to.");
        return {
          error: "No other wallets available to switch to.",
          success: false,
        };
      }
      let finalWalletName: string | undefined = params.newMainWallet;
      if (!params.isExternal) {
        const walletSwitchQuestion: any = [
          {
            type: "list",
            name: "walletName",
            message: "🔁 Select the wallet you want to switch to:",
            choices: otherWallets,
          },
        ];

        const { walletName } = await inquirer.prompt<InquirerAnswers>(
          walletSwitchQuestion
        );
        finalWalletName = walletName;
      }

      existingWalletsData.currentWallet = finalWalletName;

      if (!params.isExternal) {
        logSuccess(
          params.isExternal || false,
          `✅ Successfully switched to wallet: ${finalWalletName}`
        );
        logInfo(false, `📄 Address: ${existingWalletsData.wallets[finalWalletName!].address}`);
        writeWalletData(walletFilePath, existingWalletsData);
      }
      return {
        success: true,
        message: "Wallet switched successfully",
        walletsData: existingWalletsData,
      };
    }
    case "❌ Delete wallet": {
      const existingWalletsData: any = getWalletsData(params);
      const walletNames = Object.keys(existingWalletsData.wallets);

      const otherWallets = walletNames.filter(
        (walletName) => walletName !== existingWalletsData.currentWallet
      );

      if (otherWallets.length === 0) {
        logError(params.isExternal || false, "No other wallets available to delete.");
        return {
          error: "No other wallets available to delete.",
          success: false,
        };
      }

      let deleteWalletName: string | undefined = params.deleteWalletName;
      if (!params.isExternal) {
        logSuccess(params.isExternal || false, "📜 Other available wallets:");
        otherWallets.forEach((walletName) => {
          logInfo(
            params.isExternal || false,
            `- ${walletName}: ${existingWalletsData.wallets[walletName].address}`
          );
        });

        const deleteWalletQuestion: any = [
          {
            type: "list",
            name: "walletName",
            message: "❌ Select the wallet you want to delete:",
            choices: otherWallets,
          },
        ];

        const { walletName } = await inquirer.prompt<InquirerAnswers>(
          deleteWalletQuestion
        );
        deleteWalletName = walletName;
      }

      if (!deleteWalletName) {
        logError(params.isExternal || false, "No wallet name provided.");
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[deleteWalletName]) {
        logError(params.isExternal || false, `Wallet "${deleteWalletName}" not found.`);
        return {
          error: `Wallet "${deleteWalletName}" not found.`,
          success: false,
        };
      }

      let confirmDelete = !!params.deleteWalletName;
      if (!params.isExternal) {
        const confirmDeleteQuestion: any = [
          {
            type: "confirm",
            name: "confirmDelete",
            message: `❗️ Are you sure you want to delete the wallet "${deleteWalletName}"? This action cannot be undone.`,
            default: false,
          },
        ];

        const { confirmDelete: userConfirmDelete } =
          await inquirer.prompt<InquirerAnswers>(confirmDeleteQuestion);
        confirmDelete = userConfirmDelete ?? false;
      }

      if (!confirmDelete) {
        logWarning(params.isExternal || false, "🚫 Wallet deletion cancelled.");
        return {
          error: "Wallet deletion cancelled.",
          success: false,
        };
      }

      delete existingWalletsData.wallets[deleteWalletName];

      if (!params.isExternal) {
        logError(params.isExternal || false, `🗑️ Wallet "${deleteWalletName}" has been deleted.`);
        writeWalletData(walletFilePath, existingWalletsData);
      }

      return {
        success: true,
        message: `Wallet "${deleteWalletName}" has been deleted successfully.`,
        walletsData: existingWalletsData,
      };
    }
    case "📝 Update wallet name": {
      const existingWalletsData: any = getWalletsData(params);
      const walletNames = Object.keys(existingWalletsData.wallets);

      if (walletNames.length === 0) {
        logError(params.isExternal || false, "No wallets available to update.");
        return {
          error: "No wallets available to update.",
          success: false,
        };
      }

      let prevWalletName: string | undefined = params.previousWallet;
      if (!params.isExternal) {
        logSuccess(params.isExternal || false, "📜 Available wallets:");
        walletNames.forEach((walletName) => {
          const isCurrent =
            walletName === existingWalletsData.currentWallet
              ? chalk.yellow(" (Current)")
              : "";
          logInfo(params.isExternal || false, `- ${walletName}: ${existingWalletsData.wallets[walletName].address}${isCurrent}`);
        });

        const selectWalletQuestion: any = [
          {
            type: "list",
            name: "walletName",
            message: "📝 Select the wallet you want to update the name for:",
            choices: walletNames,
          },
        ];

        const { walletName } = await inquirer.prompt<InquirerAnswers>(
          selectWalletQuestion
        );
        prevWalletName = walletName;
      }

      if (!prevWalletName) {
        if (!params.isExternal)
          logError(params.isExternal || false, "❌ No wallet selected.");
        return {
          error: "No wallet selected.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[prevWalletName]) {
        if (!params.isExternal)
          logError(params.isExternal || false, `❌ Wallet "${prevWalletName}" not found.`);
        return {
          error: `Wallet "${prevWalletName}" not found.`,
          success: false,
        };
      }

      let newWalletName: string | undefined = params.newWalletName;
      if (!params.isExternal) {
        const updateNameQuestion: any = [
          {
            type: "input",
            name: "newWalletName",
            message: `🖋️ Enter the new name for the wallet "${prevWalletName}":`,
          },
        ];

        const { newWalletName: userNewWalletName } =
          await inquirer.prompt<InquirerAnswers>(updateNameQuestion);
        newWalletName = userNewWalletName;
      }

      if (!newWalletName) {
        if (!params.isExternal)
          logError(params.isExternal || false, "❌ No new wallet name provided.");
        return {
          error: "No new wallet name provided.",
          success: false,
        };
      }

      if (existingWalletsData.wallets[newWalletName]) {
        if (!params.isExternal) {
          logError(params.isExternal || false, `❌ A wallet with the name "${newWalletName}" already exists.`);
        }
        return {
          error: `A wallet with the name "${newWalletName}" already exists.`,
          success: false,
        };
      }

      existingWalletsData.wallets[newWalletName] =
        existingWalletsData.wallets[prevWalletName];
      delete existingWalletsData.wallets[prevWalletName];

      if (existingWalletsData.currentWallet === prevWalletName) {
        existingWalletsData.currentWallet = newWalletName;
      }

      if (!params.isExternal) {
        logSuccess(params.isExternal || false, `✅ Wallet name updated from "${prevWalletName}" to "${newWalletName}".`);
        writeWalletData(walletFilePath, existingWalletsData);
      }

      return {
        success: true,
        message: `Wallet name updated from "${prevWalletName}" to "${newWalletName}".`,
        walletsData: existingWalletsData,
      };
    }
    case "📂 Backup wallet data": {
      if (params.isExternal) {
        return {
          error: "Backup is not available in external mode.",
          success: false,
        };
      }
      const backupPathQuestion: any = [
        {
          type: "input",
          name: "backupPath",
          message: "💾 Enter the path where you want to save the backup:",
        },
      ];

      const { backupPath } = await inquirer.prompt<InquirerAnswers>(
        backupPathQuestion
      );

      if (!backupPath) {
        logError(params.isExternal || false, "⚠️ Backup path is required!");
        return;
      }
      await backupCommand(backupPath);
      break;
    }
    case "📖 Address Book": {
      if (params.isExternal) {
        return {
          error: "Address book is not available in external mode.",
          success: false,
        };
      }
      await addressBookCommand();
      break;
    }
    default: {
      if (!params.isExternal)
        logError(params.isExternal || false, "❌ Invalid option selected.");
      return {
        error: "Invalid option selected.",
        success: false,
      };
    }
  }
}

export async function writeWalletData(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    logSuccess(false, `💾 Changes saved at ${filePath}`);
  } catch (error: any) {
    logError(false, `Error saving wallet data: ${error.message || error}`);
  }
}

async function backupCommand(backupPath: string) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      logError(false, "🚫 No saved wallet found. Please create a wallet first.");
      return;
    }

    if (!backupPath) {
      logError(false, "⚠️ Please provide a valid file path for backup.");
      return;
    }

    let absoluteBackupPath = path.resolve(backupPath);
    const backupDir = path.dirname(absoluteBackupPath);

    if (
      fs.existsSync(absoluteBackupPath) &&
      fs.lstatSync(absoluteBackupPath).isDirectory()
    ) {
      absoluteBackupPath = path.join(absoluteBackupPath, "wallet_backup.json");
      logWarning(false, `⚠️ Provided a directory. Using default file name: wallet_backup.json`);
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      logSuccess(false, `📂 Created backup directory: ${backupDir}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    writeWalletData(absoluteBackupPath, walletData);
    logSuccess(false, "✅ Wallet backup created successfully!");
    logSuccess(false, `💾 Backup saved successfully at: ${absoluteBackupPath}`);
  } catch (error: any) {
    logError(false, `🚨 Error during wallet backup: ${error.message}`);
  }
}

async function createPassword(
  _isExternal: boolean,
  _password: string | undefined
): Promise<{ success: boolean; password?: string; error?: string }> {
  let finalPassword: string | undefined = _password;
  const params: WalletCommandOptions = {
    isExternal: _isExternal,
    password: _password,
  };
  if (!_isExternal) {

    logInfo(params.isExternal || false, "🔐 Password Requirements:");
    logInfo(params.isExternal || false, `• At least ${CONFIG.minLength} characters long`);
    logInfo(params.isExternal || false, `• At most ${CONFIG.maxLength} characters long`);
    logInfo(params.isExternal || false, 'Use a strong password with a mix of uppercase and lowercase letters, numbers, and special characters.');

    let isValidPassword = false;
    while (!isValidPassword) {
      const passwordQuestion: any = [
        {
          type: "password",
          name: "password",
          message: "🔒 Enter a secure password to encrypt your wallet:",
          mask: "*",
        },
      ];
      
      const { password } = await inquirer.prompt<InquirerAnswers>(passwordQuestion);
      
      if (!password) {
        logError(params.isExternal || false, "❌ Password cannot be empty. Please try again.");
        continue;
      }

      const validation = validatePassword(password);
      
      if (validation.isValid) {
        logSuccess(params.isExternal || false, "✅ Password is secure!");
        finalPassword = password;
        isValidPassword = true;
      } else {
        logError(params.isExternal || false, "❌ Password validation failed:");
        validation.errors.forEach(error => {
          logError(params.isExternal || false, `   ${error}`);
        });
        logWarning(params.isExternal || false, "Please try again with a stronger password.\n");
      }
    }
  } else {
    if (_password) {
      const validation = validatePassword(_password);
      if (!validation.isValid) {
        const errorMessage = `Password validation failed: ${validation.errors.join("; ")}`;
        return {
          success: false,
          error: errorMessage
        };
      }
    }
  }
  
  if (!finalPassword) {
    return {
      success: false,
      error: "No password provided"
    };
  }
  logSuccess(params.isExternal || false, "🎉 Wallet created successfully on Rootstock!");
  return {
    success: true,
    password: finalPassword
  };
}

async function saveWalletData(
  existingWalletsData: WalletData,
  isExternal: boolean,
  replaceCurrentWallet: boolean,
  finalWalletName: string,
  walletData: WalletItem,
  prefixedPrivateKey: string
) {
  const params: WalletCommandOptions = {
    isExternal: isExternal
  };
  if (existingWalletsData?.currentWallet) {
    if (isExternal) {
      existingWalletsData.currentWallet = replaceCurrentWallet
        ? finalWalletName
        : existingWalletsData.currentWallet;
    } else {
      const setCurrentWalletQuestion: any = [
        {
          type: "confirm",
          name: "setCurrentWallet",
          message: "🔍 Would you like to set this as the current wallet?",
          default: true,
        },
      ];

      const { setCurrentWallet } = await inquirer.prompt<InquirerAnswers>(
        setCurrentWalletQuestion
      );

      if (setCurrentWallet) {
        existingWalletsData.currentWallet = finalWalletName;
        logSuccess(params.isExternal || false, "✅ Wallet set as current!");
      }
    }
  } else {
    existingWalletsData.currentWallet = finalWalletName;
  }

  existingWalletsData.wallets[finalWalletName] = walletData;

  if (!isExternal) {
    logInfo(params.isExternal || false, "📄 Address:");
    logInfo(params.isExternal || false, `${chalk.bold(walletData.address)}`);
    logInfo(params.isExternal || false, "🔑 Private Key:");
    logInfo(params.isExternal || false, `${chalk.bold(prefixedPrivateKey)}`);
    logInfo(params.isExternal || false, "🔒 Please save the private key in a secure location.");
    writeWalletData(walletFilePath, existingWalletsData);
    return;
  }
  return {
    success: true,
    message: "Wallet saved successfully",
    walletsData: existingWalletsData,
  };
}