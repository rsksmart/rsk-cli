import inquirer from "inquirer";
import { loadWallets } from "../utils/index.js";
import { walletFilePath } from "../utils/constants.js";
import { writeWalletData } from "./wallet.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";

export async function addressBookCommand(isExternal: boolean = false) {
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
        logError(isExternal, `Label "${label}" already exists.`);
        return;
      }

      walletsData.addressBook[label] = address;
      logSuccess(isExternal, `✅ Address added under label "${label}".`);
    }

    if (action === "📖 View Address Book") {
      const addressBook = walletsData.addressBook;
      if (Object.keys(addressBook).length === 0) {
        logError(isExternal, "Address book is empty.");
        return;
      }

      logSuccess(isExternal, "📖 Address Book:");
      Object.entries(addressBook).forEach(([label, address]) => {
        logInfo(isExternal, `- ${label}: ${address}`);
      });
    }

    if (action === "✏️ Update Address") {
      const labels = Object.keys(walletsData.addressBook);
      if (labels.length === 0) {
        logError(isExternal, "Address book is empty.");
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
      logSuccess(isExternal, `✅ Address for "${label}" updated.`);
    }

    if (action === "🗑️ Delete Address") {
      const labels = Object.keys(walletsData.addressBook);
      if (labels.length === 0) {
        logError(isExternal, "Address book is empty.");
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
      logError(isExternal, `🗑️ Address with label "${label}" deleted.`);
    }

    writeWalletData(walletFilePath, walletsData);
  } catch (error: any) {
    logError(isExternal, `Error managing address book: ${error.message}`);
  }
}
