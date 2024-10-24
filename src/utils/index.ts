import {
  ALLOWED_BRIDGE_METHODS,
  METHOD_TYPES,
  walletFilePath,
} from "./constants.js";
import fs from "fs";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      `Error while formatting bridge abi fragments: ${
        error instanceof Error ? error.message : String(error)
      }`
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
