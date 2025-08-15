import { Address, isAddress, PublicClient } from "viem";
import chalk from "chalk";
import fs from "fs";
import {
  ALLOWED_BRIDGE_METHODS,
  METHOD_TYPES,
  walletFilePath,
} from "./constants.js";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateAndFormatAddress(address: string): Address | undefined {
  if (!address) return undefined;

  const formattedAddress = address.toLowerCase();
  if (!isAddress(formattedAddress)) {
    console.log(chalk.red("🚫 Invalid address"));
    return undefined;
  }
  return formattedAddress as Address;
}

export async function isValidContract(
  client: PublicClient,
  address: Address
): Promise<boolean> {
  try {
    const code = await client.getBytecode({ address });
    return code !== undefined && code !== "0x";
  } catch (error) {
    return false;
  }
}

export function getAddress(address?: Address): Address | undefined {
  if (address) {
    return validateAndFormatAddress(address);
  }

  if (!fs.existsSync(walletFilePath)) {
    console.log(chalk.red("🚫 No saved wallet found"));
    return undefined;
  }

  try {
    const { currentWallet, wallets } = JSON.parse(
      fs.readFileSync(walletFilePath, "utf8")
    );
    const savedAddress = wallets[currentWallet].address;
    return validateAndFormatAddress(savedAddress);
  } catch (error) {
    console.log(chalk.red("⚠️ Invalid wallet data"));
    return undefined;
  }
}

export function loadWallets(): string {
  if (fs.existsSync(walletFilePath)) {
    const walletsData = fs.readFileSync(walletFilePath, "utf8");

    if (walletsData) {
      return walletsData ?? JSON.stringify({ wallets: {} });
    }
  }
  return JSON.stringify({ wallets: {} });
}

export const formatBridgeFragments = (bridgeAbi: any) => {
  const formatWriteMethod = (fragment: any) => {
    return {
      ...fragment,
      constant: false,
      stateMutability: "nonpayable",
    };
  };

  try {
    const formattedBridgeAbi = bridgeAbi.map((fragment: any) => {
      if (!fragment || !fragment.name)
        throw new Error(
          `Invalid bridge abi fragment: ${JSON.stringify(fragment)}`
        );

      if (isAllowedMethod(fragment.name, "write")) {
        return formatWriteMethod(fragment);
      }

      return fragment;
    });

    return formattedBridgeAbi;
  } catch (error) {
    console.error(
      "Error while formatting bridge abi fragments"
    );
  }
};

export const isAllowedMethod = (
  name: string,
  type: keyof typeof METHOD_TYPES
) => {
  try {
    if (!METHOD_TYPES[type]) throw new Error(`Invalid method type "${type}"`);

    return ALLOWED_BRIDGE_METHODS[type].includes(name);
  } catch (error) {
    console.error(error);
  }
};
