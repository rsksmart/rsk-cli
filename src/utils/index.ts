import { Address, isAddress, PublicClient } from "viem";
import chalk from "chalk";
import fs from "fs";
import path from "path";

const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

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
    const { address: savedAddress } = JSON.parse(
      fs.readFileSync(walletFilePath, "utf8")
    );
    return validateAndFormatAddress(savedAddress);
  } catch (error) {
    console.log(chalk.red("⚠️ Invalid wallet data"));
    return undefined;
  }
}
