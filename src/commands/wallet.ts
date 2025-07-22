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
  _replaceCurrentWallet: boolean = false,
  _pk: string | undefined = undefined,
  _newMainWallet: string | undefined = undefined,
  _previousWallet: string | undefined = undefined,
  _deleteWalletName: string | undefined = undefined
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
      _replaceCurrentWallet,
      _pk,
      _newMainWallet,
      _previousWallet,
      _deleteWalletName
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
  _walletsData: WalletData | undefined,
  _newWalletName: string | undefined,
  _replaceCurrentWallet: boolean, 
  _pk: string | undefined,
  _newMainWallet: string | undefined,
  _previousWallet: string | undefined,
  _deleteWalletName: string | undefined
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
    }
    case "🔑 Import existing wallet": {
      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());

      let prefixedPrivateKey: `0x${string}`;

      if (!_isExternal && !_pk) {
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
        prefixedPrivateKey = `0x${_pk!.replace(
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
        if (!_isExternal) {
          console.log(
            chalk.red(`❌ Wallet with address ${account.address} already saved.`)
          );
        }
        return {
          error: `Wallet with address ${account.address} already saved.`,
          success: false,
        }
      }
      let finalWalletName = _newWalletName;
      if (!_isExternal) {
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
      if(!finalWalletName) {
        if (!_isExternal) console.log(chalk.red("❌ No wallet name provided."));
        return {
          error: "No wallet name provided.",
          success: false,
        }
      }
      
      if (existingWalletsData.wallets[finalWalletName]) {
        if (!_isExternal) {
          console.log(
            chalk.red(`❌ Wallet named ${finalWalletName} already exists.`)
          );
        }
        return {
          error: `Wallet named ${finalWalletName} already exists.`,
          success: false,
        };
      }
      let finalPassword: string | undefined = _password;
      if (!_isExternal) {
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
        if (!_isExternal) console.log(chalk.red("❌ No password provided."));
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

      let encryptedPrivateKey = cipher.update(
        prefixedPrivateKey,
        "utf8",
        "hex"
      );
      encryptedPrivateKey += cipher.final("hex");

      if (existingWalletsData?.currentWallet) {
        let finalCurrentWallet: boolean = _replaceCurrentWallet;
        if (!_isExternal) {
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
          console.log(chalk.green("✅ Wallet set as current!"));
        }
      } else {
        existingWalletsData.currentWallet = finalWalletName;
      }

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv.toString("hex"),
      };

      existingWalletsData.wallets[finalWalletName] = walletData;

      if (!_isExternal) {
        console.log(chalk.green("✅ Wallet validated successfully!"));
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
      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());
  
      const walletCount = Object.keys(existingWalletsData.wallets).length;
  
      if (walletCount === 0) {
        if (!_isExternal) console.log(chalk.red("❌ No wallets found."));
        return {
          error: "No wallets found.",
          success: false,
        };
      }
  
      if (!_isExternal) console.log(chalk.green(`📜 Saved wallets (${walletCount}):`));
      Object.keys(existingWalletsData.wallets).forEach((walletName) => {
        if (!_isExternal) {
          console.log(
            chalk.blue(
              `- ${walletName}: ${existingWalletsData.wallets[walletName].address}`
            )
          );
        }
      });
  
      if (existingWalletsData.currentWallet) {
        if (!_isExternal) {
          console.log(
            chalk.yellow(`\n🔑 Current wallet: ${existingWalletsData.currentWallet}`)
          );
        }
      }
      return {
        success: true,
        message: "Wallets listed successfully",
        walletsData: existingWalletsData,
      };
    }
    case "🔁 Switch wallet": {
      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());
  
      const walletNames = Object.keys(existingWalletsData.wallets);
  
      const otherWallets = walletNames.filter(
        (walletName) => walletName !== existingWalletsData.currentWallet
      );
  
      if (otherWallets.length === 0) {
        if (!_isExternal) console.log(chalk.red("❌ No other wallets available to switch to."));
        return {
          error: "No other wallets available to switch to.",
          success: false,
        };
      }
      let finalWalletName: string | undefined = _newMainWallet;
      if (!_isExternal) {
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
      
      if (!_isExternal) {
        console.log(
          chalk.green(`✅ Successfully switched to wallet: ${finalWalletName}`)
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
      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());
      const walletNames = Object.keys(existingWalletsData.wallets);
  
      const otherWallets = walletNames.filter(
        (walletName) => walletName !== existingWalletsData.currentWallet
      );
  
      if (otherWallets.length === 0) {
        if (!_isExternal) console.log(chalk.red("❌ No other wallets available to delete."));
        return {
          error: "No other wallets available to delete.",
          success: false,
        };
      }
      
      let deleteWalletName: string | undefined = _deleteWalletName;
      if (!_isExternal) {
        console.log(chalk.green("📜 Other available wallets:"));
        otherWallets.forEach((walletName) => {
          console.log(
            chalk.blue(
              `- ${walletName}: ${existingWalletsData.wallets[walletName].address}`
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
        deleteWalletName = walletName;
      }

      if (!deleteWalletName) {
        if (!_isExternal) console.log(chalk.red("❌ No wallet name provided."));
        return {
          error: "No wallet name provided.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[deleteWalletName]) {
        if (!_isExternal) console.log(chalk.red(`❌ Wallet "${deleteWalletName}" not found.`));
        return {
          error: `Wallet "${deleteWalletName}" not found.`,
          success: false,
        };
      }

      let confirmDelete = !!_deleteWalletName;
      if (!_isExternal) {
        const confirmDeleteQuestion: any = [
          {
            type: "confirm",
            name: "confirmDelete",
            message: `❗️ Are you sure you want to delete the wallet "${deleteWalletName}"? This action cannot be undone.`,
            default: false,
          },
        ];
    
        const { confirmDelete: userConfirmDelete } = await inquirer.prompt<InquirerAnswers>(
          confirmDeleteQuestion
        );
        confirmDelete = userConfirmDelete ?? false;
      }
  
      if (!confirmDelete) {
        if (!_isExternal) console.log(chalk.yellow("🚫 Wallet deletion cancelled."));
        return {
          error: "Wallet deletion cancelled.",
          success: false,
        };
      }
  
      delete existingWalletsData.wallets[deleteWalletName];
      
      if (!_isExternal) {
        console.log(chalk.red(`🗑️ Wallet "${deleteWalletName}" has been deleted.`));
        writeWalletData(walletFilePath, existingWalletsData);
      }
      
      return {
        success: true,
        message: `Wallet "${deleteWalletName}" has been deleted successfully.`,
        walletsData: existingWalletsData,
      };
    }
    case "📝 Update wallet name": {
      const existingWalletsData: any = _walletsData && _isExternal ? _walletsData : JSON.parse(loadWallets());
      const walletNames = Object.keys(existingWalletsData.wallets);
  
      if (walletNames.length === 0) {
        if (!_isExternal) console.log(chalk.red("❌ No wallets available to update."));
        return {
          error: "No wallets available to update.",
          success: false,
        };
      }
      
      let prevWalletName: string | undefined = _previousWallet;
      if (!_isExternal) {
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
        if (!_isExternal) console.log(chalk.red("❌ No wallet selected."));
        return {
          error: "No wallet selected.",
          success: false,
        };
      }

      if (!existingWalletsData.wallets[prevWalletName]) {
        if (!_isExternal) console.log(chalk.red(`❌ Wallet "${prevWalletName}" not found.`));
        return {
          error: `Wallet "${prevWalletName}" not found.`,
          success: false,
        };
      }

      let newWalletName: string | undefined = _newWalletName;
      if (!_isExternal) {
        const updateNameQuestion: any = [
          {
            type: "input",
            name: "newWalletName",
            message: `🖋️ Enter the new name for the wallet "${prevWalletName}":`,
          },
        ];
    
        const { newWalletName: userNewWalletName } = await inquirer.prompt<InquirerAnswers>(
          updateNameQuestion
        );
        newWalletName = userNewWalletName;
      }

      if (!newWalletName) {
        if (!_isExternal) console.log(chalk.red("❌ No new wallet name provided."));
        return {
          error: "No new wallet name provided.",
          success: false,
        };
      }
  
      if (existingWalletsData.wallets[newWalletName]) {
        if (!_isExternal) {
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
  
      existingWalletsData.wallets[newWalletName] = existingWalletsData.wallets[prevWalletName];
      delete existingWalletsData.wallets[prevWalletName];
  
      if (existingWalletsData.currentWallet === prevWalletName) {
        existingWalletsData.currentWallet = newWalletName;
      }
  
      if (!_isExternal) {
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
      if (_isExternal) {
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