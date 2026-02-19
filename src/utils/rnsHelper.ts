import { Address, isAddress } from "viem";
import { ZERO_ADDRESS } from "./constants.js";
import { validateAndFormatAddressRSK } from "./index.js";
import { logError, logWarning, logSuccess } from "./logger.js";

type ResolveRNSOptions = {
  name: string;
  testnet?: boolean;
  isExternal?: boolean;
};

type ResolveAddressOptions = {
  address: Address;
  testnet?: boolean;
  isExternal?: boolean;
};

type ResolveToAddressOptions = {
  input: string;
  testnet?: boolean;
  isExternal?: boolean;
};


export function isRNSDomain(input: string): boolean {
  if (input.endsWith(".rsk")) {
    const domainName = input.replace(".rsk", "");
    return domainName.length >= 5 && /^[a-z0-9-]+$/i.test(domainName);
  }
  
  if (!input.startsWith("0x") && !input.includes(".")) {
    return input.length >= 5 && /^[a-z0-9-]+$/i.test(input);
  }
  
  return false;
}

async function getResolver() {
  const RNSResolverModule = await import("@rsksmart/rns-resolver.js");
  return (RNSResolverModule as any).default.default || (RNSResolverModule as any).default;
}

export async function resolveRNSToAddress(
  params: ResolveRNSOptions
): Promise<Address | null> {
  const isExternal = params.isExternal || false;

  try {
    let name = params.name;
    if (!name.endsWith(".rsk")) {
      name = name + ".rsk";
    }

    const Resolver = await getResolver();
    const resolver = params.testnet
      ? Resolver.forRskTestnet({})
      : Resolver.forRskMainnet({});

    const resolvedAddress = await resolver.addr(name) as Address;

    if (!resolvedAddress || resolvedAddress === ZERO_ADDRESS) {
      logWarning(isExternal, `⚠️ No address found for ${name}`);
      return null;
    }

    const formatted = validateAndFormatAddressRSK(resolvedAddress, !!params.testnet);
    if (!formatted) {
      logError(isExternal, `Failed to validate resolved address for ${name}`);
      return null;
    }
    logSuccess(isExternal, `✅ Resolved ${name} to ${formatted}`);
    return formatted;
  } catch (error) {
    logError(isExternal, `Failed to resolve RNS name: ${params.name}`);
    if (error instanceof Error && !isExternal) {
      logWarning(isExternal, error.message);
    }
    return null;
  }
}

export async function resolveAddressToRNS(
  params: ResolveAddressOptions
): Promise<string | null> {
  const isExternal = params.isExternal || false;

  try {
    const Resolver = await getResolver();
    const resolver = params.testnet
      ? Resolver.forRskTestnet({})
      : Resolver.forRskMainnet({});

    const resolverName = await resolver.reverse(params.address) as string;

    if (resolverName && resolverName !== "") {
      logSuccess(isExternal, `✅ Resolved ${params.address} to ${resolverName}`);
      return resolverName;
    }

    return null;
  } catch (error) {
    logError(isExternal, `Failed to reverse resolve address: ${params.address}`);
    if (error instanceof Error && !isExternal) {
      logWarning(isExternal, error.message);
    }
    return null;
  }
}

export async function resolveToAddress(
  params: ResolveToAddressOptions
): Promise<Address | null> {
  const isExternal = params.isExternal || false;

  if (params.input.startsWith("0x") && params.input.length === 42) {
    if (isAddress(params.input)) {
      return params.input as Address;
    } else {
      logError(isExternal, "Invalid address format");
      return null;
    }
  }

  if (isRNSDomain(params.input)) {
    return await resolveRNSToAddress({
      name: params.input,
      testnet: params.testnet,
      isExternal: params.isExternal
    });
  }

  logError(isExternal, "Input is neither a valid address nor an RNS domain");
  return null;
}
