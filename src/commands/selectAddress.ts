import { loadWallets } from "../utils/index.js";
import inquirer from "inquirer";
import { Address } from "viem";
import { logError } from "../utils/logger.js";

export async function selectAddress(isExternal: boolean = false): Promise<Address> {
	try {
		const walletsDataString = loadWallets();
		const walletsData = JSON.parse(walletsDataString);
		walletsData.addressBook = walletsData.addressBook || {};

		const addressBook = walletsData.addressBook;
		const addressBookLabels = Object.keys(addressBook);

		const addressChoices = [
			...addressBookLabels.map((label) => ({
				name: `${label} (${addressBook[label]})`,
				value: addressBook[label],
			})),
			{ name: "Enter a custom address", value: "custom" },
		];

		const { selectedAddress } = await inquirer.prompt([
			{
				type: "list",
				name: "selectedAddress",
				message: "Select an address:",
				choices: addressChoices,
			},
		]);

		if (selectedAddress === "custom") {
			const { customAddress } = await inquirer.prompt([
				{
					type: "input",
					name: "customAddress",
					message: "Enter the address:",
				},
			]);
			return customAddress;
		}

		return selectedAddress;
	} catch (error: any) {
		logError(isExternal, `Error selecting address: ${error.message || error}`);
		throw error;
	}
}
