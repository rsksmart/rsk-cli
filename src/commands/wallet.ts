import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import chalk from "chalk";
import inquirer from "inquirer";
import fs from "fs";
import crypto from "crypto";
import { loadWallets } from "../utils/index.js";
import { InquirerAnswers } from "../utils/types.js";
import { walletFilePath } from "../utils/constants.js";

export async function walletCommand() {
  try {
    if (fs.existsSync(walletFilePath)) {
      console.log(chalk.grey("📁 Wallet data file found."));

      const walletsData = loadWallets();

      if (walletsData.currentWallet) {
        console.log(
          chalk.yellow(`\n🔑 Current wallet: ${walletsData.currentWallet}`)
        );
      }
    }

    const questions: any = [
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          "🆕 Create a new wallet",
          "🔑 Import existing wallet",
          "🔍 List saved wallets",
          "🔁 Switch wallet",
          "📝 Update wallet name",
          "❌ Delete wallet",
        ],
      },
    ];

    const { action } = await inquirer.prompt<InquirerAnswers>(questions);

    if (action === "🆕 Create a new wallet") {
      const privateKey: string = generatePrivateKey();
      const prefixedPrivateKey: `0x${string}` = `0x${privateKey.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);
      const walletsData = loadWallets();

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

      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(password!, Uint8Array.from(iv), 32);
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Uint8Array.from(key),
        Uint8Array.from(iv)
      );

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
        return;
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

      console.log(
        chalk.white(`📄 Address:`),
        chalk.green(`${chalk.bold(account.address)}`)
      );
      console.log(
        chalk.white(`🔑 Private Key:`),
        chalk.green(`${chalk.bold(prefixedPrivateKey)}`)
      );
      console.log(
        chalk.gray("🔒 Please save the private key in a secure location.")
      );

      walletsData.wallets[walletName!] = walletData;

      fs.writeFileSync(
        walletFilePath,
        JSON.stringify(walletsData, null, 2),
        "utf8"
      );
      console.log(chalk.green(`💾 Wallet saved securely at ${walletFilePath}`));
      return;
    }

    if (action === "🔑 Import existing wallet") {
      const walletsData = loadWallets();

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
        return;
      }

      const prefixedPrivateKey = `0x${privateKey!.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);

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

      fs.writeFileSync(
        walletFilePath,
        JSON.stringify(walletsData, null, 2),
        "utf8"
      );
      console.log(chalk.green(`💾 Wallet saved securely at ${walletFilePath}`));
    }

    if (action === "🔍 List saved wallets") {
      const walletsData = loadWallets();
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
    }

    if (action === "🔁 Switch wallet") {
      const walletsData = loadWallets();
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

      fs.writeFileSync(
        walletFilePath,
        JSON.stringify(walletsData, null, 2),
        "utf8"
      );
      console.log(chalk.green(`💾 Wallet switch saved at ${walletFilePath}`));
    }

    if (action === "❌ Delete wallet") {
      const walletsData = loadWallets();
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
          message: `⚠️ Are you sure you want to delete the wallet "${walletName}"? This action cannot be undone.`,
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

      fs.writeFileSync(
        walletFilePath,
        JSON.stringify(walletsData, null, 2),
        "utf8"
      );
      console.log(chalk.green(`💾 Changes saved at ${walletFilePath}`));
    }

    if (action === "📝 Update wallet name") {
      const walletsData = loadWallets();
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

      fs.writeFileSync(
        walletFilePath,
        JSON.stringify(walletsData, null, 2),
        "utf8"
      );
      console.log(chalk.green(`💾 Changes saved at ${walletFilePath}`));
    }
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error creating or managing wallets:"),
      chalk.yellow(error.message || error)
    );
  }
}
