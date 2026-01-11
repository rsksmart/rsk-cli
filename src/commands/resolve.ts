import chalk from "chalk";
import { Address } from "viem";
import { resolveRNSToAddress, resolveAddressToRNS } from "../utils/rnsHelper.js";
import { validateAndFormatAddressRSK, toEip1191ChecksumAddress } from "../utils/index.js";
import { logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type ResolveCommandOptions = {
  name: string;
  testnet: boolean;
  reverse: boolean;
  isExternal?: boolean;
};

type ResolveResult = {
  success: boolean;
  data?: {
    name?: string;
    address?: string;
    network: string;
  };
  error?: string;
};


export async function resolveCommand(
  params: ResolveCommandOptions = { name: "", testnet: false, reverse: false }
): Promise<ResolveResult | void> {
  const spinner = createSpinner(params.isExternal || false);

  try {
    if (params.reverse) {
      const formattedAddress = validateAndFormatAddressRSK(params.name, params.testnet);
      if (!formattedAddress) {
        const errorMessage = "Invalid address format for reverse lookup";
        spinner.fail(chalk.red(`❌ ${errorMessage}`));
        return params.isExternal ? { success: false, error: errorMessage } : undefined;
      }

      spinner.start(chalk.white("🔍 Looking up name for address..."));
      const resolverName = await resolveAddressToRNS({
        address: formattedAddress as `0x${string}`,
        testnet: params.testnet,
        isExternal: params.isExternal
      });

      spinner.stop();

      if (resolverName) {
        spinner.succeed(chalk.green("✅ Name found successfully"));
        const displayAddress = toEip1191ChecksumAddress(formattedAddress as string, params.testnet) as Address;
        logInfo(params.isExternal || false, `📄 Address: ${displayAddress}`);
        logInfo(params.isExternal || false, `🏷️  Name: ${resolverName}`);
        
        if (params.isExternal) {
          return {
            success: true,
            data: {
              address: displayAddress,
              name: resolverName,
              network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"
            }
          };
        }
      } else {
        spinner.fail(chalk.yellow("⚠️ No name found for this address"));
        logInfo(params.isExternal || false,"💡 To enable reverse lookup for your address, you need to set a reverse record in the RNS manager");

        if (params.isExternal) {
          return {
            success: false,
            error: "No name found for this address"
          };
        }
      }
    } else {
      let domainName = params.name;
      if (!domainName.endsWith(".rsk")) {
        domainName = domainName + ".rsk";
      }

      spinner.start(chalk.white(`🔍 Resolving ${domainName}...`));

      const resolvedAddress = await resolveRNSToAddress({
        name: domainName,
        testnet: params.testnet,
        isExternal: params.isExternal
      });

      spinner.stop();

      if (resolvedAddress) {
        spinner.succeed(chalk.green("✅ Domain resolved successfully"));
        logInfo(params.isExternal || false, `🏷️  Domain: ${domainName}`);
        logInfo(params.isExternal || false, `📄 Address: ${resolvedAddress}`);
        logInfo(params.isExternal || false, `🌐 Network: ${params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"}`);
        
        if (params.isExternal) {
          return {
            success: true,
            data: {
              name: domainName,
              address: resolvedAddress,
              network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"
            }
          };
        }
      } else {
        spinner.fail(chalk.yellow(`⚠️ No address found for ${domainName}`));
        logInfo(params.isExternal || false,"💡 This domain may not be registered or has no address configured");
        
        if (params.isExternal) {
          return {
            success: false,
            error: `No address found for ${domainName}`
          };
        }
      }
    }
  } catch (error) {
    spinner.stop();
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    
    if (params.isExternal) {
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
