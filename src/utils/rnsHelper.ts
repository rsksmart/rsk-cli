import { Address, isAddress } from "viem";
import chalk from "chalk";
import { ZERO_ADDRESS } from "./constants.js";
import { validateAndFormatAddressRSK } from "./index.js";

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

function logMessage(
  isExternal: boolean | undefined,
  message: string,
  color: typeof chalk.white = chalk.white
) {
  if (!isExternal) {
    console.log(color(message));
  }
}

function logError(isExternal: boolean | undefined, message: string) {
  logMessage(isExternal, `❌ ${message}`, chalk.red);
}

function logWarning(isExternal: boolean | undefined, message: string) {
  logMessage(isExternal, message, chalk.yellow);
}

function logSuccess(isExternal: boolean | undefined, message: string) {
  logMessage(isExternal, message, chalk.green);
}

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
  // @ts-ignore - dynamic import of @rsksmart/rns-resolver.js
  const RNSResolverModule = await import("@rsksmart/rns-resolver.js");
  return (RNSResolverModule as any).default.default || (RNSResolverModule as any).default;
}

export async function resolveRNSToAddress(
  params: ResolveRNSOptions
): Promise<Address | null> {
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
      logWarning(params.isExternal, `⚠️ No address found for ${name}`);
      return null;
    }

    const formatted = validateAndFormatAddressRSK(resolvedAddress, !!params.testnet);
    if (!formatted) {
      logError(params.isExternal, `Failed to validate resolved address for ${name}`);
      return null;
    }
    logSuccess(params.isExternal, `✅ Resolved ${name} to ${formatted}`);
    return formatted;
  } catch (error) {
    logError(params.isExternal, `Failed to resolve RNS name: ${params.name}`);
    if (error instanceof Error && !params.isExternal) {
      logWarning(params.isExternal, error.message);
    }
    return null;
  }
}

export async function resolveAddressToRNS(
  params: ResolveAddressOptions
): Promise<string | null> {
  try {
    const Resolver = await getResolver();
    const resolver = params.testnet 
      ? Resolver.forRskTestnet({})
      : Resolver.forRskMainnet({});

    const resolverName = await resolver.reverse(params.address) as string;

    if (resolverName && resolverName !== "") {
      logSuccess(params.isExternal, `✅ Resolved ${params.address} to ${resolverName}`);
      return resolverName;
    }
    
    return null;
  } catch (error) {
    logError(params.isExternal, `Failed to reverse resolve address: ${params.address}`);
    if (error instanceof Error && !params.isExternal) {
      logWarning(params.isExternal, error.message);
    }
    return null;
  }
}

export async function resolveToAddress(
  params: ResolveToAddressOptions
): Promise<Address | null> {
  if (params.input.startsWith("0x") && params.input.length === 42) {
    if (isAddress(params.input)) {
      return params.input as Address;
    } else {
      logError(params.isExternal, "Invalid address format");
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

  logError(params.isExternal, "Input is neither a valid address nor an RNS domain");
  return null;
}
