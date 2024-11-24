import { Address, isAddress, PublicClient } from "viem";
import chalk from "chalk";

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
