import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { walletFilePath } from "../utils/constants.js";
import { loadWallets } from "../utils/index.js";
import crypto from "crypto";

type RestoreOptions = {
  path?: string;
  password?: string;
  force?: boolean;
};

export async function walletRestoreCommand(options: RestoreOptions = {}) {
  try {

    let backupPath = options.path;
    if (!backupPath) {
      const { backupPath: inputPath } = await inquirer.prompt([
        {
          type: "input",
          name: "backupPath",
          message: "💾 Enter the path to the backup file:",
        },
      ]);
      backupPath = inputPath;
    }


    const absoluteBackupPath = path.resolve(backupPath!);


    if (!fs.existsSync(absoluteBackupPath)) {
      console.log(chalk.red(`🚫 Backup file not found at: ${absoluteBackupPath}`));
      return;
    }


    const backupContent = fs.readFileSync(absoluteBackupPath, "utf8");
    let backupData;

    try {
      backupData = JSON.parse(backupContent);
    } catch (error) {
      console.log(chalk.red("❌ Invalid backup file format"));
      return;
    }


    if (backupData.encrypted) {
      let password = options.password;
      if (!password) {
        const { password: inputPassword } = await inquirer.prompt([
          {
            type: "password",
            name: "password",
            message: "🔑 Enter the backup file password:",
            mask: "*",
          },
        ]);
        password = inputPassword;
      }

      try {
        const iv = Buffer.from(backupData.iv, "hex");
        const key = crypto.scryptSync(password!, Uint8Array.from(iv), 32);
        const decipher = crypto.createDecipheriv("aes-256-cbc", Uint8Array.from(key), Uint8Array.from(iv));
        
        const decryptedData = decipher.update(backupData.data, "hex", "utf8") + decipher.final("utf8");
        backupData = JSON.parse(decryptedData);
      } catch (error) {
        console.log(chalk.red("❌ Failed to decrypt backup file. Invalid password or corrupted file."));
        return;
      }
    }


    if (!backupData._backup || backupData._backup.type !== "wallet-backup") {
      console.log(chalk.red("❌ Invalid backup file: Missing backup metadata"));
      return;
    }


    const currentWalletsData = JSON.parse(loadWallets());
    const currentWallets = currentWalletsData.wallets || {};


    const conflicts = [];
    for (const [walletName, walletData] of Object.entries(backupData.wallets)) {
      if (currentWallets[walletName]) {
        conflicts.push(walletName);
      }
    }


    if (conflicts.length > 0 && !options.force) {
      console.log(chalk.yellow(`⚠️ Found ${conflicts.length} wallet name conflicts:`));
      conflicts.forEach(name => console.log(chalk.yellow(`  - ${name}`)));

      const { resolve } = await inquirer.prompt([
        {
          type: "list",
          name: "resolve",
          message: "How would you like to resolve these conflicts?",
          choices: [
            { name: "Skip conflicting wallets", value: "skip" },
            { name: "Overwrite existing wallets", value: "overwrite" },
            { name: "Rename conflicting wallets", value: "rename" },
            { name: "Cancel restore", value: "cancel" },
          ],
        },
      ]);

      if (resolve === "cancel") {
        console.log(chalk.yellow("🚫 Restore cancelled"));
        return;
      }

      if (resolve === "skip") {
        conflicts.forEach(name => delete backupData.wallets[name]);
      } else if (resolve === "overwrite") {

      } else if (resolve === "rename") {
        for (const name of conflicts) {
          const { newName } = await inquirer.prompt([
            {
              type: "input",
              name: "newName",
              message: `Enter new name for wallet "${name}":`,
              default: `${name}_restored`,
            },
          ]);
          backupData.wallets[newName] = backupData.wallets[name];
          delete backupData.wallets[name];
        }
      }
    }


    const mergedData = {
      ...currentWalletsData,
      wallets: {
        ...currentWallets,
        ...backupData.wallets,
      },
    };


    fs.writeFileSync(walletFilePath, JSON.stringify(mergedData, null, 2), "utf8");
    console.log(chalk.green("✅ Wallet restore completed successfully!"));
    console.log(chalk.green(`💾 Restored wallets saved at: ${walletFilePath}`));

  } catch (error: any) {
    console.error(
      chalk.red("🚨 Error during wallet restore:"),
      chalk.yellow(error.message)
    );
  }
} 