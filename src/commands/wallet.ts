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

export async function walletCommand (
  _action: string | undefined = undefined, 
  _password: string | undefined = undefined,
  _walletsData: WalletData | undefined = undefined,
  _newWalletName: string | undefined = undefined,
  _replaceCurrentWallet: boolean = false
) {
  try {
    if (!_action && fs.existsSync(walletFilePath)) {
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
    if (_action && !_password) {
      return {
        error: "Password is required to import an existing wallet, when using in external mode.",
        success: false,
      };
    }
    let runOption: string | undefined = _action;
    if (!_action) {
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
    return await processOption(
      !!_action,
      runOption,
      _password,
      _walletsData,
      _newWalletName,
      _replaceCurrentWallet
    );
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error creating or managing wallets:"),
      chalk.yellow(error.message || error)
    );
  }
}

export async function processOption(
  _isExternal: boolean,
  _action: string | undefined, 
  _password: string | undefined,
  _walletsData: WalletData | undefined = undefined,
  _newWalletName: string | undefined = undefined,
  _replaceCurrentWallet: boolean = false
) {
  switch (_action) {
    case "🆕 Create a new wallet": {
      const privateKey: string = generatePrivateKey();
      const prefixedPrivateKey: `0x${string}` = `0x${privateKey.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);

      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());

      const finalPassword = await createPassword(_isExternal, _password);

      if (!finalPassword) {
        return {
          error: "Error creating wallet, password required contains an error.",
          success: false,
        };
      }

      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(finalPassword, Uint8Array.from(iv), 32);
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        Uint8Array.from(iv)
      );

      let finalWalletName = _newWalletName;
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
          console.log(chalk.red(`❌ Wallet named ${walletName} already exists.`));
          return {
            error: "Wallet named ${walletName} already exists.",
            success: false,
          }
        }
        finalWalletName = walletName;
      }

      if(!finalWalletName) {
        if (_isExternal) {
          return {
            error: "No wallet name provided.",
            success: false,
          }
        } else {
          console.log(chalk.red("❌ No wallet name provided."));
          return {
            error: "No wallet name provided.",
            success: false,
          }
        }
      }

      let encryptedPrivateKey = cipher.update(
        prefixedPrivateKey,
        "utf8",
        "hex"
      );
      encryptedPrivateKey += cipher.final("hex");

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv.toString("hex"),
      };

      return await saveWalletData(
        existingWalletsData,
        _isExternal,
        _replaceCurrentWallet,
        finalWalletName,
        walletData,
        prefixedPrivateKey
      );
    break;
    }
    case "🔑 Import existing wallet": {
      const walletsDataString = loadWallets();

      const walletsData = JSON.parse(walletsDataString);

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

      const prefixedPrivateKey = `0x${privateKey!.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);

      if (
        Object.values(walletsData.wallets).some(
          (wallet: any) => wallet.address === account.address
        )
      ) {
        console.log(
          chalk.red(`❌ Wallet with address ${account.address} already saved.`)
        );
        return {
          error: "Wallet with address ${account.address} already saved.",
          success: false,
        }
      }

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

      if (walletsData.wallets[walletName!]) {
        console.log(chalk.red(`❌ Wallet named ${walletName} already exists.`));
        return {
          error: `Wallet named ${walletName} already exists.`,
          success: false,
        }
      }

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

      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(password!, Uint8Array.from(iv), 32);
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        Uint8Array.from(iv)
      );

      let encryptedPrivateKey = cipher.update(
        prefixedPrivateKey,
        "utf8",
        "hex"
      );
      encryptedPrivateKey += cipher.final("hex");

      if (walletsData?.currentWallet) {
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
          walletsData.currentWallet = walletName;
          console.log(chalk.green("✅ Wallet set as current!"));
        }
      } else {
        walletsData.currentWallet = walletName;
      }

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv.toString("hex"),
      };

      walletsData.wallets[walletName!] = walletData;

      console.log(chalk.green("✅ Wallet validated successfully!"));
      console.log(
        chalk.white(`📄 Address:`),
        chalk.green(`${chalk.bold(account.address)}`)
      );

      writeWalletData(walletFilePath, walletsData);
      break;
    }
    case "🔍 List saved wallets": {
      const walletsDataString = loadWallets();
  
      const walletsData = JSON.parse(walletsDataString);
      const walletCount = Object.keys(walletsData.wallets).length;
  
      if (walletCount === 0) {
        console.log(chalk.red("❌ No wallets found."));
        return;
      }
  
      console.log(chalk.green(`📜 Saved wallets (${walletCount}):`));
      Object.keys(walletsData.wallets).forEach((walletName) => {
        console.log(
          chalk.blue(
            `- ${walletName}: ${walletsData.wallets[walletName].address}`
          )
        );
      });
  
      if (walletsData.currentWallet) {
        console.log(
          chalk.yellow(`\n🔑 Current wallet: ${walletsData.currentWallet}`)
        );
      }
      break;
    }
    case "🔁 Switch wallet": {
      const walletsDataString = loadWallets();
  
      const walletsData = JSON.parse(walletsDataString);
      const walletNames = Object.keys(walletsData.wallets);
  
      const otherWallets = walletNames.filter(
        (walletName) => walletName !== walletsData.currentWallet
      );
  
      if (otherWallets.length === 0) {
        console.log(chalk.red("❌ No other wallets available to switch to."));
        return;
      }
  
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
  
      walletsData.currentWallet = walletName;
  
      console.log(
        chalk.green(`✅ Successfully switched to wallet: ${walletName}`)
      );
      console.log(
        chalk.white(`📄 Address:`),
        chalk.green(`${chalk.bold(walletsData.wallets[walletName!].address)}`)
      );
  
      writeWalletData(walletFilePath, walletsData);
      break;
    }
    case "❌ Delete wallet": {
      const walletsDataString = loadWallets();
  
      const walletsData = JSON.parse(walletsDataString);
      const walletNames = Object.keys(walletsData.wallets);
  
      const otherWallets = walletNames.filter(
        (walletName) => walletName !== walletsData.currentWallet
      );
  
      if (otherWallets.length === 0) {
        console.log(chalk.red("❌ No other wallets available to delete."));
        return;
      }
  
      console.log(chalk.green("📜 Other available wallets:"));
      otherWallets.forEach((walletName) => {
        console.log(
          chalk.blue(
            `- ${walletName}: ${walletsData.wallets[walletName].address}`
          )
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
  
      const confirmDeleteQuestion: any = [
        {
          type: "confirm",
          name: "confirmDelete",
          message: `❗️ Are you sure you want to delete the wallet "${walletName}"? This action cannot be undone.`,
          default: false,
        },
      ];
  
      const { confirmDelete } = await inquirer.prompt<InquirerAnswers>(
        confirmDeleteQuestion
      );
  
      if (!confirmDelete) {
        console.log(chalk.yellow("🚫 Wallet deletion cancelled."));
        return;
      }
  
      delete walletsData.wallets[walletName!];
      console.log(chalk.red(`🗑️ Wallet "${walletName}" has been deleted.`));
  
      writeWalletData(walletFilePath, walletsData);
      break;
    }
    case "📝 Update wallet name": {
      const walletsDataString = loadWallets();
  
      const walletsData = JSON.parse(walletsDataString);
      const walletNames = Object.keys(walletsData.wallets);
  
      if (walletNames.length === 0) {
        console.log(chalk.red("❌ No wallets available to update."));
        return;
      }
  
      // List all wallets
      console.log(chalk.green("📜 Available wallets:"));
      walletNames.forEach((walletName) => {
        const isCurrent =
          walletName === walletsData.currentWallet
            ? chalk.yellow(" (Current)")
            : "";
        console.log(
          chalk.blue(
            `- ${walletName}: ${walletsData.wallets[walletName].address}${isCurrent}`
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
  
      const updateNameQuestion: any = [
        {
          type: "input",
          name: "newWalletName",
          message: `🖋️ Enter the new name for the wallet "${walletName}":`,
        },
      ];
  
      const { newWalletName } = await inquirer.prompt<InquirerAnswers>(
        updateNameQuestion
      );
  
      if (walletsData.wallets[newWalletName!]) {
        console.log(
          chalk.red(
            `❌ A wallet with the name "${newWalletName}" already exists.`
          )
        );
        return;
      }
  
      walletsData.wallets[newWalletName!] = walletsData.wallets[walletName!];
      delete walletsData.wallets[walletName!];
  
      if (walletsData.currentWallet === walletName) {
        walletsData.currentWallet = newWalletName;
      }
  
      console.log(
        chalk.green(
          `✅ Wallet name updated from "${walletName}" to "${newWalletName}".`
        )
      );
  
      writeWalletData(walletFilePath, walletsData);
      break;
    }
    case "📂 Backup wallet data": {
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
      await addressBookCommand(); 
      break;
    }
    default: {
      console.log(chalk.red("❌ Invalid option selected."));
      break;
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
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }

    if (!backupPath) {
      console.log(chalk.red("⚠️ Please provide a valid file path for backup."));
      return;
    }

    let absoluteBackupPath = path.resolve(backupPath);
    const backupDir = path.dirname(absoluteBackupPath);

    if (fs.existsSync(absoluteBackupPath) && fs.lstatSync(absoluteBackupPath).isDirectory()) {
      absoluteBackupPath = path.join(absoluteBackupPath, 'wallet_backup.json');
      console.log(chalk.yellow(`⚠️ Provided a directory. Using default file name: wallet_backup.json`));
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

  if(!isExternal) {
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