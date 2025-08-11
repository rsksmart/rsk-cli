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

function logMessage(
  params: WalletCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: WalletCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: WalletCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logWarning(params: WalletCommandOptions, message: string) {
  logMessage(params, message, chalk.yellow);
}

function logInfo(params: WalletCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
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
      console.log(chalk.grey("📁 Wallet data file found."));

      const walletsDataString = loadWallets();

      if (walletsDataString) {
        const walletsData = JSON.parse(walletsDataString);

        if (walletsData.currentWallet) {
          console.log(
            chalk.yellow(`\n🔑 Current wallet: ${walletsData.currentWallet}`)
          );
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
    console.error(
      chalk.red("❌ Error creating or managing wallets:"),
      chalk.yellow(error.message || error)
    );
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

      const finalPassword = await createPassword(
        params.isExternal ?? false,
        params.password
      );

      if (!finalPassword) {
        return {
          error: "Error creating wallet, password required contains an error.",
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
          logError(params, `Wallet named ${walletName} already exists.`);
          return {
            error: `Wallet named ${walletName} already exists.`,
            success: false,
          };
        }
        finalWalletName = walletName;
      }

      if (!finalWalletName) {
        logError(params, "No wallet name provided.");
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
        prefixedPrivateKey
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
          params,
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
        logError(params, "No wallet name provided.");
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      if (existingWalletsData.wallets[finalWalletName]) {
        logError(params, `Wallet named ${finalWalletName} already exists.`);
        return {
          error: `Wallet named ${finalWalletName} already exists.`,
          success: false,
        };
      }
      let finalPassword: string | undefined = params.password;
      if (!params.isExternal) {
        const passwordQuestion: any = [
          {
            type: "password",
            name: "password",
            message: "🔒 Enter a password to encrypt your wallet:",
            mask: "*",
          },
        ];

        const { password } = await inquirer.prompt<InquirerAnswers>(
          passwordQuestion
        );
        finalPassword = password;
      }

      if (!finalPassword) {
        logError(params, "No password provided.");
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
          logSuccess(params, "✅ Wallet set as current!");
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
        logSuccess(params, "✅ Wallet validated successfully!");
        console.log(
          chalk.white(`📄 Address:`),
          chalk.green(`${chalk.bold(account.address)}`)
        );
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
        logError(params, "No wallets found.");
        return {
          error: "No wallets found.",
          success: false,
        };
      }

      logSuccess(params, `📜 Saved wallets (${walletCount}):`);
      Object.keys(existingWalletsData.wallets).forEach((walletName) => {
        logInfo(
          params,
          `- ${walletName}: ${existingWalletsData.wallets[walletName].address}`
        );
      });

      if (existingWalletsData.currentWallet) {
        logWarning(
          params,
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
        logError(params, "No other wallets available to switch to.");
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
          params,
          `✅ Successfully switched to wallet: ${finalWalletName}`
        );
        console.log(
          chalk.white(`📄 Address:`),
          chalk.green(
            `${chalk.bold(
              existingWalletsData.wallets[finalWalletName!].address
            )}`
          )
        );
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
        logError(params, "No other wallets available to delete.");
        return {
          error: "No other wallets available to delete.",
          success: false,
        };
      }

      let deleteWalletName: string | undefined = params.deleteWalletName;
      if (!params.isExternal) {
        logSuccess(params, "📜 Other available wallets:");
        otherWallets.forEach((walletName) => {
          logInfo(
            params,
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
        logError(params, "No wallet name provided.");
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[deleteWalletName]) {
        logError(params, `Wallet "${deleteWalletName}" not found.`);
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
        logWarning(params, "🚫 Wallet deletion cancelled.");
        return {
          error: "Wallet deletion cancelled.",
          success: false,
        };
      }

      delete existingWalletsData.wallets[deleteWalletName];

      if (!params.isExternal) {
        logError(params, `🗑️ Wallet "${deleteWalletName}" has been deleted.`);
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
        logError(params, "No wallets available to update.");
        return {
          error: "No wallets available to update.",
          success: false,
        };
      }

      let prevWalletName: string | undefined = params.previousWallet;
      if (!params.isExternal) {
        console.log(chalk.green("📜 Available wallets:"));
        walletNames.forEach((walletName) => {
          const isCurrent =
            walletName === existingWalletsData.currentWallet
              ? chalk.yellow(" (Current)")
              : "";
          console.log(
            chalk.blue(
              `- ${walletName}: ${existingWalletsData.wallets[walletName].address}${isCurrent}`
            )
          );
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
          console.log(chalk.red("❌ No wallet selected."));
        return {
          error: "No wallet selected.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[prevWalletName]) {
        if (!params.isExternal)
          console.log(chalk.red(`❌ Wallet "${prevWalletName}" not found.`));
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
          console.log(chalk.red("❌ No new wallet name provided."));
        return {
          error: "No new wallet name provided.",
          success: false,
        };
      }

      if (existingWalletsData.wallets[newWalletName]) {
        if (!params.isExternal) {
          console.log(
            chalk.red(
              `❌ A wallet with the name "${newWalletName}" already exists.`
            )
          );
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
        console.log(
          chalk.green(
            `✅ Wallet name updated from "${prevWalletName}" to "${newWalletName}".`
          )
        );
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
        console.log(chalk.red("⚠️ Backup path is required!"));
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
        console.log(chalk.red("❌ Invalid option selected."));
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
    console.log(chalk.green(`💾 Changes saved at ${filePath}`));
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error saving wallet data:"),
      chalk.yellow(error.message || error)
    );
  }
}

async function backupCommand(backupPath: string) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(
        chalk.red("🚫 No saved wallet found. Please create a wallet first.")
      );
      return;
    }

    if (!backupPath) {
      console.log(chalk.red("⚠️ Please provide a valid file path for backup."));
      return;
    }

    let absoluteBackupPath = path.resolve(backupPath);
    const backupDir = path.dirname(absoluteBackupPath);

    if (
      fs.existsSync(absoluteBackupPath) &&
      fs.lstatSync(absoluteBackupPath).isDirectory()
    ) {
      absoluteBackupPath = path.join(absoluteBackupPath, "wallet_backup.json");
      console.log(
        chalk.yellow(
          `⚠️ Provided a directory. Using default file name: wallet_backup.json`
        )
      );
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log(chalk.green(`📂 Created backup directory: ${backupDir}`));
    }

    const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));

    writeWalletData(absoluteBackupPath, walletData);
    console.log(
      chalk.green("✅ Wallet backup created successfully!"),
      chalk.green(`\n💾 Backup saved successfully at: ${absoluteBackupPath}`)
    );
  } catch (error: any) {
    console.error(
      chalk.red("🚨 Error during wallet backup:"),
      chalk.yellow(error.message)
    );
  }
}

async function createPassword(
  _isExternal: boolean,
  _password: string | undefined
): Promise<string | undefined> {
  let finalPassword: string | undefined = _password;
  if (!_isExternal) {
    console.log(
      chalk.rgb(255, 165, 0)(`🎉 Wallet created successfully on Rootstock!`)
    );

    const passwordQuestion: any = [
      {
        type: "password",
        name: "password",
        message: "🔒 Enter a password to encrypt your wallet:",
        mask: "*",
      },
    ];
    const { password } = await inquirer.prompt<InquirerAnswers>(
      passwordQuestion
    );
    finalPassword = password;
  }
  return finalPassword;
}

async function saveWalletData(
  existingWalletsData: WalletData,
  isExternal: boolean,
  replaceCurrentWallet: boolean,
  finalWalletName: string,
  walletData: WalletItem,
  prefixedPrivateKey: string
) {
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
        console.log(chalk.green("✅ Wallet set as current!"));
      }
    }
  } else {
    existingWalletsData.currentWallet = finalWalletName;
  }

  existingWalletsData.wallets[finalWalletName] = walletData;

  if (!isExternal) {
    console.log(
      chalk.white(`📄 Address:`),
      chalk.green(`${chalk.bold(walletData.address)}`)
    );
    console.log(
      chalk.white(`🔑 Private Key:`),
      chalk.green(`${chalk.bold(prefixedPrivateKey)}`)
    );
    console.log(
      chalk.gray("🔒 Please save the private key in a secure location.")
    );
    writeWalletData(walletFilePath, existingWalletsData);
    return;
  }
  return {
    success: true,
    message: "Wallet saved successfully",
    walletsData: existingWalletsData,
  };
}
