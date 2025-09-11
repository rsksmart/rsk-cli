import chalk from "chalk";
import ora from "ora";
import { isAddress } from "viem";
import { resolveRNSToAddress, resolveAddressToRNS } from "../utils/rnsHelper.js";

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

function logMessage(
  params: ResolveCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logInfo(params: ResolveCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: ResolveCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: ResolveCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: ResolveCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  params: ResolveCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.fail(message);
  }
}

export async function resolveCommand(
  params: ResolveCommandOptions = { name: "", testnet: false, reverse: false }
): Promise<ResolveResult | void> {
  const spinner = ora();

  try {
    if (params.reverse) {
      if (!isAddress(params.name)) {
        const errorMessage = "Invalid address format for reverse lookup";
        failSpinner(params, spinner, chalk.red(`❌ ${errorMessage}`));
        return params.isExternal ? { success: false, error: errorMessage } : undefined;
      }

      startSpinner(params, spinner, chalk.white("🔍 Looking up name for address..."));
      
      const resolverName = await resolveAddressToRNS({
        address: params.name as `0x${string}`,
        testnet: params.testnet,
        isExternal: params.isExternal
      });

      stopSpinner(params, spinner);

      if (resolverName) {
        succeedSpinner(params, spinner, chalk.green("✅ Name found successfully"));
        logMessage(params, chalk.white(`📄 Address:`) + " " + chalk.green(params.name));
        logMessage(params, chalk.white(`🏷️  Name:`) + " " + chalk.green(resolverName));
        
        if (params.isExternal) {
          return {
            success: true,
            data: {
              address: params.name,
              name: resolverName,
              network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"
            }
          };
        }
      } else {
        failSpinner(params, spinner, chalk.yellow("⚠️ No name found for this address"));
        
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

      startSpinner(params, spinner, chalk.white(`🔍 Resolving ${domainName}...`));

      const resolvedAddress = await resolveRNSToAddress({
        name: domainName,
        testnet: params.testnet,
        isExternal: params.isExternal
      });

      stopSpinner(params, spinner);

      if (resolvedAddress) {
        succeedSpinner(params, spinner, chalk.green("✅ Domain resolved successfully"));
        logMessage(params, chalk.white(`🏷️  Domain:`) + " " + chalk.green(domainName));
        logMessage(params, chalk.white(`📄 Address:`) + " " + chalk.green(resolvedAddress));
        logMessage(params, chalk.white(`🌐 Network:`) + " " + chalk.green(params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"));
        
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
        failSpinner(params, spinner, chalk.yellow(`⚠️ No address found for ${domainName}`));
        logInfo(params, "💡 This domain may not be registered or has no address configured");
        
        if (params.isExternal) {
          return {
            success: false,
            error: `No address found for ${domainName}`
          };
        }
      }
    }
  } catch (error) {
    stopSpinner(params, spinner);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    
    if (params.isExternal) {
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}