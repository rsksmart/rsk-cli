import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import { Address, namehash, isAddress } from "viem";
import { 
  RNS_REGISTRY_MAINNET, 
  RNS_RESOLVER_MAINNET,
  RNS_REGISTRY_TESTNET,
  RNS_RESOLVER_TESTNET,
  ZERO_ADDRESS
} from "../utils/constants.js";
import { RNS_REGISTRY_ABI, RNS_RESOLVER_ABI } from "../utils/rnsHelper.js";

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
  const spinner = ora();

  try {
    const provider = new ViemProvider(params.testnet);
    const client = await provider.getPublicClient();

    if (params.reverse) {
      if (!isAddress(params.name)) {
        const errorMessage = "Invalid address format for reverse lookup";
        if (!params.isExternal) {
          spinner.fail(chalk.red(errorMessage));
        }
        return params.isExternal ? { success: false, error: errorMessage } : undefined;
      }

      if (!params.isExternal) {
        spinner.start(chalk.white("Looking up name for address..."));
      }
      
      try {
        const address = params.name as Address;
        const resolverAddress = params.testnet ? RNS_RESOLVER_TESTNET : RNS_RESOLVER_MAINNET;
        
        const resolverName = await client.readContract({
          address: resolverAddress,
          abi: RNS_RESOLVER_ABI,
          functionName: "name",
          args: [address],
        }) as string;

        if (resolverName && resolverName !== "") {
          if (!params.isExternal) {
            spinner.succeed(chalk.green("Name found successfully"));
            console.log(chalk.white(`Address:`), chalk.green(address));
            console.log(chalk.white(`Name:`), chalk.green(resolverName));
          }
          
          if (params.isExternal) {
            return {
              success: true,
              data: {
                address,
                name: resolverName,
                network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"
              }
            };
          }
        } else {
          if (!params.isExternal) {
            spinner.fail(chalk.yellow("No name found for this address"));
          }
          
          if (params.isExternal) {
            return {
              success: false,
              error: "No name found for this address"
            };
          }
        }
      } catch (error) {
        if (!params.isExternal) {
          spinner.fail(chalk.red("Failed to reverse resolve address"));
          console.error(chalk.yellow("This address may not have a reverse record set"));
        }
        
        if (params.isExternal) {
          return {
            success: false,
            error: "Failed to reverse resolve address"
          };
        }
      }
    } else {
      let domainName = params.name;
      if (!domainName.endsWith(".rsk")) {
        domainName = domainName + ".rsk";
      }

      if (!params.isExternal) {
        spinner.start(chalk.white(`Resolving ${domainName}...`));
      }

      const node = namehash(domainName);

      const registryAddress = params.testnet ? RNS_REGISTRY_TESTNET : RNS_REGISTRY_MAINNET;
      const resolverAddress = await client.readContract({
        address: registryAddress,
        abi: RNS_REGISTRY_ABI,
        functionName: "resolver",
        args: [node],
      }) as Address;

      if (resolverAddress === ZERO_ADDRESS) {
        if (!params.isExternal) {
          spinner.fail(chalk.yellow(`No resolver found for ${domainName}`));
          console.log(chalk.blue("This domain may not be registered"));
        }
        
        if (params.isExternal) {
          return {
            success: false,
            error: `No resolver found for ${domainName}`
          };
        }
        return;
      }

      const resolvedAddress = await client.readContract({
        address: resolverAddress,
        abi: RNS_RESOLVER_ABI,
        functionName: "addr",
        args: [node],
      }) as Address;

      if (resolvedAddress === ZERO_ADDRESS) {
        if (!params.isExternal) {
          spinner.fail(chalk.yellow(`No address set for ${domainName}`));
          console.log(chalk.blue("This domain exists but has no address configured"));
        }
        
        if (params.isExternal) {
          return {
            success: false,
            error: `No address set for ${domainName}`
          };
        }
        return;
      }

      if (!params.isExternal) {
        spinner.succeed(chalk.green("Domain resolved successfully"));
        console.log(chalk.white(`Domain:`), chalk.green(domainName));
        console.log(chalk.white(`Address:`), chalk.green(resolvedAddress));
        console.log(
          chalk.white(`Network:`),
          chalk.green(params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet")
        );
      }
      
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
    }
  } catch (error) {
    if (!params.isExternal) {
      spinner.stop();
      console.error(
        chalk.red("Error resolving name:"),
        chalk.yellow(error instanceof Error ? error.message : "An unknown error occurred")
      );
    }
    
    if (params.isExternal) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred"
      };
    }
  }
}