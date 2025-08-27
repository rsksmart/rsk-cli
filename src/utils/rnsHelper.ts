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

type ResolveRNSOptions = {
  client: PublicClient;
  name: string;
  testnet?: boolean;
  isExternal?: boolean;
};

type ResolveAddressOptions = {
  client: PublicClient;
  address: Address;
  testnet?: boolean;
  isExternal?: boolean;
};

type ResolveToAddressOptions = {
  client: PublicClient;
  input: string;
  testnet?: boolean;
  isExternal?: boolean;
};

export function isRNSDomain(input: string): boolean {
  return input.endsWith(".rsk") || (!input.startsWith("0x") && input.includes("."));
}

export async function resolveRNSToAddress(
  params: ResolveRNSOptions
): Promise<Address | null> {
  try {
    let name = params.name;
    if (!name.endsWith(".rsk")) {
      name = name + ".rsk";
    }

    const node = namehash(name);

    const registryAddress = params.testnet ? RNS_REGISTRY_TESTNET : RNS_REGISTRY_MAINNET;
    const resolverAddress = await params.client.readContract({
      address: registryAddress as Address,
      abi: RNS_REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    }) as Address;

    if (resolverAddress === ZERO_ADDRESS) {
      if (!params.isExternal) {
        console.log(chalk.yellow(`⚠️ No resolver found for ${name}`));
      }
      return null;
    }

    const resolvedAddress = await params.client.readContract({
      address: resolverAddress,
      abi: RNS_RESOLVER_ABI,
      functionName: "addr",
      args: [node],
    }) as Address;

    if (resolvedAddress === ZERO_ADDRESS) {
      if (!params.isExternal) {
        console.log(chalk.yellow(`⚠️ No address set for ${name}`));
      }
      return null;
    }

    if (!params.isExternal) {
      console.log(chalk.green(`✅ Resolved ${name} to ${resolvedAddress}`));
    }
    return resolvedAddress;
  } catch (error) {
    if (!params.isExternal) {
      console.error(chalk.red(`❌ Failed to resolve RNS name: ${params.name}`));
      if (error instanceof Error) {
        console.error(chalk.yellow(error.message));
      }
    }
    return null;
  }
}

export async function resolveAddressToRNS(
  params: ResolveAddressOptions
): Promise<string | null> {
  try {
    const resolverAddress = params.testnet ? RNS_RESOLVER_TESTNET : RNS_RESOLVER_MAINNET;
    
    const resolverName = await params.client.readContract({
      address: resolverAddress as Address,
      abi: RNS_RESOLVER_ABI,
      functionName: "name",
      args: [params.address],
    }) as string;

    if (resolverName && resolverName !== "") {
      if (!params.isExternal) {
        console.log(chalk.green(`✅ Resolved ${params.address} to ${resolverName}`));
      }
      return resolverName;
    }
    
    return null;
  } catch (error) {
    if (!params.isExternal) {
      console.error(chalk.red(`❌ Failed to reverse resolve address: ${params.address}`));
      if (error instanceof Error) {
        console.error(chalk.yellow(error.message));
      }
    }
    return null;
  }
}

export async function resolveToAddress(
  params: ResolveToAddressOptions
): Promise<Address | null> {
  if (params.input.startsWith("0x") && params.input.length === 42) {
    try {
      return params.input as Address;
    } catch {
      if (!params.isExternal) {
        console.error(chalk.red("❌ Invalid address format"));
      }
      return null;
    }
  }

  if (isRNSDomain(params.input)) {
    return await resolveRNSToAddress({
      client: params.client,
      name: params.input,
      testnet: params.testnet,
      isExternal: params.isExternal
    });
  }

  if (!params.isExternal) {
    console.error(chalk.red("❌ Input is neither a valid address nor an RNS domain"));
  }
  return null;
}