import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { walletFilePath } from "../utils/constants.js";
import { loadWallets } from "../utils/index.js";
import crypto from "crypto";

type BackupOptions = {
  path?: string;
  encrypt?: boolean;
  password?: string;
};

export async function walletBackupCommand(options: BackupOptions = {}) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }


    let backupPath = options.path;
    if (!backupPath) {
      const { backupPath: inputPath } = await inquirer.prompt([
        {
          type: "input",
          name: "backupPath",
          message: "💾 Enter the path where you want to save the backup:",
          default: path.join(process.cwd(), "wallet_backup.json"),
        },
      ]);
      backupPath = inputPath;
    }


    let absoluteBackupPath = path.resolve(backupPath!);
    const backupDir = path.dirname(absoluteBackupPath);

 
    if (fs.existsSync(absoluteBackupPath) && fs.lstatSync(absoluteBackupPath).isDirectory()) {
      absoluteBackupPath = path.join(absoluteBackupPath, "wallet_backup.json");
      console.log(chalk.yellow(`⚠️ Provided a directory. Using default file name: wallet_backup.json`));
    }

 
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log(chalk.green(`📂 Created backup directory: ${backupDir}`));
    }

 
    const walletData = JSON.parse(loadWallets());


    const backupData = {
      ...walletData,
      _backup: {
        timestamp: new Date().toISOString(),
        version: "1.0",
        type: "wallet-backup",
      },
    };


    if (options.encrypt || !options.encrypt) {
      const { encrypt } = await inquirer.prompt([
        {
          type: "confirm",
          name: "encrypt",
          message: "🔒 Would you like to encrypt the backup file?",
          default: true,
        },
      ]);

      if (encrypt) {
        const { password } = await inquirer.prompt([
          {
            type: "password",
            name: "password",
            message: "🔑 Enter a password to encrypt the backup:",
            mask: "*",
          },
        ]);

        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, Uint8Array.from(iv), 32);
        const cipher = crypto.createCipheriv("aes-256-cbc", Uint8Array.from(key), Uint8Array.from(iv));

        const encryptedData = {
          encrypted: true,
          iv: iv.toString("hex"),
          data: cipher.update(JSON.stringify(backupData), "utf8", "hex") + cipher.final("hex"),
        };

        fs.writeFileSync(absoluteBackupPath, JSON.stringify(encryptedData, null, 2), "utf8");
        console.log(chalk.green("✅ Encrypted wallet backup created successfully!"));
      } else {
        fs.writeFileSync(absoluteBackupPath, JSON.stringify(backupData, null, 2), "utf8");
        console.log(chalk.green("✅ Wallet backup created successfully!"));
      }
    }

    console.log(chalk.green(`💾 Backup saved successfully at: ${absoluteBackupPath}`));
  } catch (error: any) {
    console.error(
      chalk.red("🚨 Error during wallet backup:"),
      chalk.yellow(error.message)
    );
  }
} 