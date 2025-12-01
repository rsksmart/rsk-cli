import { Address, isAddress, PublicClient, keccak256, stringToHex } from "viem";
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

export function getRootstockChainId(testnet: boolean): 30 | 31 {
  return testnet ? 31 : 30;
}

export function validateAndFormatAddressRSK(
  address: string,
  testnet: boolean = false
): Address | undefined {
  if (!address) return undefined;
  const lower = `0x${address.replace(/^0x/, "").toLowerCase()}`;
  const hex = lower.replace(/^0x/, "");
  if (!/^([a-f0-9]{40})$/.test(hex)) return undefined;

  const input = address.startsWith("0x") ? address : `0x${address}`;
  const hasUpper = /[A-F]/.test(input);
  const hasLower = /[a-f]/.test(input);
  const isMixedCase = hasUpper && hasLower;

  if (isMixedCase) {
    const eip1191 = toEip1191ChecksumAddress(lower, testnet);
    const eip55 = toEip55ChecksumAddress(lower);
    if (input !== eip1191 && input !== eip55) {
      return undefined;
    }
  }

  return lower as Address;
}

export function toEip1191ChecksumAddress(
  address: string,
  testnet: boolean = false
): Address {
  const chainId = getRootstockChainId(testnet);
  const clean = address.replace(/^0x/, "");
  if (!/^([a-fA-F0-9]{40})$/.test(clean)) {
    return (`0x${clean.toLowerCase()}`) as Address;
  }
  const lower = clean.toLowerCase();
  const input = `${chainId}0x${lower}`;
  const hash = keccak256(stringToHex(input)).slice(2);
  let checksummed = "";
  for (let i = 0; i < lower.length; i++) {
    const h = parseInt(hash[i], 16);
    checksummed += h >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return (`0x${checksummed}`) as Address;
}

export function toEip55ChecksumAddress(address: string): Address {
  const clean = address.replace(/^0x/, "");
  if (!/^([a-fA-F0-9]{40})$/.test(clean)) {
    return (`0x${clean.toLowerCase()}`) as Address;
  }
  const lower = clean.toLowerCase();
  const hash = keccak256(stringToHex(lower)).slice(2);
  let checksummed = "";
  for (let i = 0; i < lower.length; i++) {
    const h = parseInt(hash[i], 16);
    checksummed += h >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return (`0x${checksummed}`) as Address;
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
