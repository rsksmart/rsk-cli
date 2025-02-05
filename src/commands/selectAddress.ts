import { loadWallets } from "../utils/index.js";
import inquirer from "inquirer";
import chalk from "chalk";
import { Address } from "viem";

export async function selectAddress(): Promise<Address> {
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
		console.error(
			chalk.red("❌ Error selecting address:"),
			chalk.yellow(error.message || error)
		);
		throw error;
	}
}
