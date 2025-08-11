import { Address, namehash, PublicClient } from "viem";
import chalk from "chalk";

// RNS Contract Addresses
const RNS_REGISTRY_MAINNET = "0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5" as Address;
const RNS_RESOLVER_MAINNET = "0xD87f8121D44F3717d4bAdC50b24E50044f86D64B" as Address;

// RNS Testnet Contract Addresses
const RNS_REGISTRY_TESTNET = "0x7d284aaac6e925aad802a53c0c69efe3764597b8" as Address;
const RNS_RESOLVER_TESTNET = "0x1e321bf4e5f0c20e5f5afaa2390ef6ff8cff8a7b" as Address;

// Simplified RNS Registry ABI
const RNS_REGISTRY_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
] as const;

// Simplified RNS Resolver ABI
const RNS_RESOLVER_ABI = [
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

/**
 * Check if a string is an RNS domain name
 * Note: This function accepts any domain-like string (including .eth, .com, etc.)
 * to allow flexibility, but the RNS resolver will only work with .rsk domains
 */
export function isRNSDomain(input: string): boolean {
  return input.endsWith(".rsk") || (!input.startsWith("0x") && input.includes("."));
}

/**
 * Resolve an RNS domain name to an address
 */
export async function resolveRNSToAddress(
  client: PublicClient,
  name: string,
  testnet: boolean = false
): Promise<Address | null> {
  try {
    // Ensure name ends with .rsk
    if (!name.endsWith(".rsk")) {
      name = name + ".rsk";
    }

    // Calculate namehash for the domain
    const node = namehash(name);

    // Get resolver address from registry
    const registryAddress = testnet ? RNS_REGISTRY_TESTNET : RNS_REGISTRY_MAINNET;
    const resolverAddress = await client.readContract({
      address: registryAddress,
      abi: RNS_REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    }) as Address;

    if (resolverAddress === "0x0000000000000000000000000000000000000000") {
      console.log(chalk.yellow(`⚠️ No resolver found for ${name}`));
      return null;
    }

    // Get address from resolver
    const resolvedAddress = await client.readContract({
      address: resolverAddress,
      abi: RNS_RESOLVER_ABI,
      functionName: "addr",
      args: [node],
    }) as Address;

    if (resolvedAddress === "0x0000000000000000000000000000000000000000") {
      console.log(chalk.yellow(`⚠️ No address set for ${name}`));
      return null;
    }

    console.log(chalk.green(`✅ Resolved ${name} to ${resolvedAddress}`));
    return resolvedAddress;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to resolve RNS name: ${name}`));
    if (error instanceof Error) {
      console.error(chalk.yellow(error.message));
    }
    return null;
  }
}

/**
 * Resolve an address to an RNS name (reverse lookup)
 */
export async function resolveAddressToRNS(
  client: PublicClient,
  address: Address,
  testnet: boolean = false
): Promise<string | null> {
  try {
    const resolverAddress = testnet ? RNS_RESOLVER_TESTNET : RNS_RESOLVER_MAINNET;
    
    const resolverName = await client.readContract({
      address: resolverAddress,
      abi: RNS_RESOLVER_ABI,
      functionName: "name",
      args: [address],
    }) as string;

    if (resolverName && resolverName !== "") {
      console.log(chalk.green(`✅ Resolved ${address} to ${resolverName}`));
      return resolverName;
    }
    
    return null;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to reverse resolve address: ${address}`));
    if (error instanceof Error) {
      console.error(chalk.yellow(error.message));
    }
    return null;
  }
}

/**
 * Resolve input to address - handles both RNS domains and regular addresses
 */
export async function resolveToAddress(
  client: PublicClient,
  input: string,
  testnet: boolean = false
): Promise<Address | null> {
  // Check if input is already a valid address
  if (input.startsWith("0x") && input.length === 42) {
    try {
      return input as Address;
    } catch {
      console.error(chalk.red("❌ Invalid address format"));
      return null;
    }
  }

  // Otherwise, try to resolve as RNS domain
  if (isRNSDomain(input)) {
    return await resolveRNSToAddress(client, input, testnet);
  }

  console.error(chalk.red("❌ Input is neither a valid address nor an RNS domain"));
  return null;
}