import { Address, namehash, PublicClient } from "viem";
import chalk from "chalk";
import {
  RNS_REGISTRY_MAINNET,
  RNS_RESOLVER_MAINNET,
  RNS_REGISTRY_TESTNET,
  RNS_RESOLVER_TESTNET,
  ZERO_ADDRESS
} from "./constants.js";

export const RNS_REGISTRY_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
] as const;

export const RNS_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "addr",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

export function isRNSDomain(input: string): boolean {
  return input.endsWith(".rsk") || (!input.startsWith("0x") && input.includes("."));
}

export async function resolveRNSToAddress(
  client: PublicClient,
  name: string,
  testnet: boolean = false,
  isExternal: boolean = false
): Promise<Address | null> {
  try {
    if (!name.endsWith(".rsk")) {
      name = name + ".rsk";
    }

    const node = namehash(name);

    const registryAddress = testnet ? RNS_REGISTRY_TESTNET : RNS_REGISTRY_MAINNET;
    const resolverAddress = await client.readContract({
      address: registryAddress as Address,
      abi: RNS_REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    }) as Address;

    if (resolverAddress === ZERO_ADDRESS) {
      if (!isExternal) {
        console.log(chalk.yellow(`No resolver found for ${name}`));
      }
      return null;
    }

    const resolvedAddress = await client.readContract({
      address: resolverAddress,
      abi: RNS_RESOLVER_ABI,
      functionName: "addr",
      args: [node],
    }) as Address;

    if (resolvedAddress === ZERO_ADDRESS) {
      if (!isExternal) {
        console.log(chalk.yellow(`No address set for ${name}`));
      }
      return null;
    }

    if (!isExternal) {
      console.log(chalk.green(`Resolved ${name} to ${resolvedAddress}`));
    }
    return resolvedAddress;
  } catch (error) {
    if (!isExternal) {
      console.error(chalk.red(`Failed to resolve RNS name: ${name}`));
      if (error instanceof Error) {
        console.error(chalk.yellow(error.message));
      }
    }
    return null;
  }
}

export async function resolveAddressToRNS(
  client: PublicClient,
  address: Address,
  testnet: boolean = false,
  isExternal: boolean = false
): Promise<string | null> {
  try {
    const resolverAddress = testnet ? RNS_RESOLVER_TESTNET : RNS_RESOLVER_MAINNET;
    
    const resolverName = await client.readContract({
      address: resolverAddress as Address,
      abi: RNS_RESOLVER_ABI,
      functionName: "name",
      args: [address],
    }) as string;

    if (resolverName && resolverName !== "") {
      if (!isExternal) {
        console.log(chalk.green(`Resolved ${address} to ${resolverName}`));
      }
      return resolverName;
    }
    
    return null;
  } catch (error) {
    if (!isExternal) {
      console.error(chalk.red(`Failed to reverse resolve address: ${address}`));
      if (error instanceof Error) {
        console.error(chalk.yellow(error.message));
      }
    }
    return null;
  }
}

export async function resolveToAddress(
  client: PublicClient,
  input: string,
  testnet: boolean = false,
  isExternal: boolean = false
): Promise<Address | null> {
  if (input.startsWith("0x") && input.length === 42) {
    try {
      return input as Address;
    } catch {
      if (!isExternal) {
        console.error(chalk.red("Invalid address format"));
      }
      return null;
    }
  }

  if (isRNSDomain(input)) {
    return await resolveRNSToAddress(client, input, testnet, isExternal);
  }

  if (!isExternal) {
    console.error(chalk.red("Input is neither a valid address nor an RNS domain"));
  }
  return null;
}