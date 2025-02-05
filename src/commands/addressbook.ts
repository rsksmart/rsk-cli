import inquirer from "inquirer";
import chalk from "chalk";
import { loadWallets } from "../utils/index.js";
import { walletFilePath } from "../utils/constants.js";
import { writeWalletData } from "./wallet.js";

export async function addressBookCommand() {
  try {
    const walletsDataString = loadWallets();
    const walletsData = JSON.parse(walletsDataString);
    walletsData.addressBook = walletsData.addressBook || {};

    const actions = [
      "➕ Add Address",
      "📖 View Address Book",
      "✏️ Update Address",
      "🗑️ Delete Address",
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do with your address book?",
        choices: actions,
      },
    ]);

    if (action === "➕ Add Address") {
      const { label, address } = await inquirer.prompt([
        {
          type: "input",
          name: "label",
          message: "Enter a label for the address:",
        },
        {
          type: "input",
          name: "address",
          message: "Enter the address:",
        },
      ]);

      if (walletsData.addressBook[label]) {
        console.log(chalk.red(`❌ Label "${label}" already exists.`));
        return;
      }

      walletsData.addressBook[label] = address;
      console.log(chalk.green(`✅ Address added under label "${label}".`));
    }

    if (action === "📖 View Address Book") {
      const addressBook = walletsData.addressBook;
      if (Object.keys(addressBook).length === 0) {
        console.log(chalk.red("❌ Address book is empty."));
        return;
      }

      console.log(chalk.green("📖 Address Book:"));
      Object.entries(addressBook).forEach(([label, address]) => {
        console.log(chalk.blue(`- ${label}: ${address}`));
      });
    }

    if (action === "✏️ Update Address") {
      const labels = Object.keys(walletsData.addressBook);
      if (labels.length === 0) {
        console.log(chalk.red("❌ Address book is empty."));
        return;
      }

      const { label } = await inquirer.prompt([
        {
          type: "list",
          name: "label",
          message: "Select the address you want to update:",
          choices: labels,
        },
      ]);

      const { newAddress } = await inquirer.prompt([
        {
          type: "input",
          name: "newAddress",
          message: `Enter the new address for "${label}":`,
        },
      ]);

      walletsData.addressBook[label] = newAddress;
      console.log(chalk.green(`✅ Address for "${label}" updated.`));
    }

    if (action === "🗑️ Delete Address") {
      const labels = Object.keys(walletsData.addressBook);
      if (labels.length === 0) {
        console.log(chalk.red("❌ Address book is empty."));
        return;
      }

      const { label } = await inquirer.prompt([
        {
          type: "list",
          name: "label",
          message: "Select the address you want to delete:",
          choices: labels,
        },
      ]);

      delete walletsData.addressBook[label];
      console.log(chalk.red(`🗑️ Address with label "${label}" deleted.`));
    }

    writeWalletData(walletFilePath, walletsData);
  } catch (error: any) {
    console.error(chalk.red("❌ Error managing address book:"), error.message);
  }
}
