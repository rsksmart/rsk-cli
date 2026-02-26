import precompiled from "@rsksmart/rsk-precompiled-abis";
import chalk from "chalk";
import { formatBridgeFragments } from "../utils/index.js";
import inquirer from "inquirer";
import { ALLOWED_BRIDGE_METHODS } from "../utils/constants.js";
import ViemProvider from "../utils/viemProvider.js";
import { WalletData } from "../utils/types.js";
import { getConfig } from "./config.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type InquirerAnswers = {
  selectedType?: FunctionType;
  selectedFunction?: string;
  args?: string[];
};
type BridgeCommandOptions = {
  testnet?: boolean | undefined;
  name: string;
  isExternal?: boolean;
  selectedType?: FunctionType;
  functionName?: string;
  args?: any[];
  walletsData?: WalletData;
  password?: string;
};

enum FunctionType {
  READ = "read",
  WRITE = "write",
}

export async function bridgeCommand(params: BridgeCommandOptions) {
  try {
    let config;
    try {
      config = getConfig();

      if (!config || !config.defaultNetwork || !config.displayPreferences) {
        logError(params.isExternal || false, "Invalid configuration detected. Please run 'rsk-cli config' to set up your configuration.");
        return {
          error: "Invalid configuration",
          success: false,
        };
      }
    } catch (error: any) {
      logError(params.isExternal || false, `Failed to load configuration: ${error.message}`);
      return {
        error: "Configuration loading failed",
        success: false,
      };
    }

    const isTestnet = params.testnet === undefined ? (config.defaultNetwork === 'testnet') : params.testnet;

    if (!params.isExternal) {
      logInfo(
        params.isExternal || false,
        `Using network: ${isTestnet ? 'testnet' : 'mainnet'} (${params.testnet === undefined ? 'from config' : 'from parameter'})`
      );
    }

    const spinner = createSpinner(params.isExternal || false);
    if (!config.displayPreferences.compactMode) {
      logInfo(
        params.isExternal || false,
        `🔧 Initializing bridge for ${isTestnet ? "testnet" : "mainnet"}...`
      );
    }

    const bridge = {
      address: precompiled.bridge.address,
      abi: formatBridgeFragments(precompiled.bridge.abi),
    };
    let finalSelectedType: FunctionType | undefined = params.selectedType;
    if (!params.isExternal) {
      try {
        const readOrWriteQuestion: any = [
          {
            type: "list",
            name: "selectedType",
            message: "Select the type of function you want to call:",
            choices: [FunctionType.READ, FunctionType.WRITE],
          },
        ];

        const { selectedType } = await inquirer.prompt<InquirerAnswers>(
          readOrWriteQuestion
        );
        finalSelectedType = selectedType!;
      } catch (error: any) {
        if (error.isTtyError) {
          logError(params.isExternal || false, "Interactive prompts are not supported in this environment. Please use the --help flag to see available options.");
          return {
            error: "Interactive prompts not supported",
            success: false,
          };
        }
        throw error;
      }
    }

    if (!finalSelectedType) {
      logError(params.isExternal || false, "Selected type is required.");
      return {
        error: "Selected type is required.",
        success: false,
      };
    }

    const provider = new ViemProvider(isTestnet);
    const publicClient = await provider.getPublicClient();

    const explorerUrl = isTestnet
      ? `https://explorer.testnet.rootstock.io/address/${bridge.address}`
      : `https://explorer.rootstock.io/address/${bridge.address}`;

    const functions = ALLOWED_BRIDGE_METHODS[finalSelectedType!];

    let finalSelectedFunction: string | undefined = params.functionName;
    if (!params.isExternal) {
      try {
        const functionQuestion: any = [
          {
            type: "list",
            name: "selectedFunction",
            message: `Select a ${finalSelectedType} function to call:`,
            choices: [...functions.map((item) => item)],
          },
        ];

        const { selectedFunction } = await inquirer.prompt<InquirerAnswers>(
          functionQuestion
        );
        finalSelectedFunction = selectedFunction!;
      } catch (error: any) {
        if (error.isTtyError) {
          logError(params.isExternal || false, "Interactive prompts are not supported in this environment. Please use the --help flag to see available options.");
          return {
            error: "Interactive prompts not supported",
            success: false,
          };
        }
        throw error;
      }
    }
    if (!finalSelectedFunction) {
      logError(params.isExternal || false, "Selected function is required.");
      return {
        error: "Selected function is required.",
        success: false,
      };
    }

    const selectedAbiFunction = bridge.abi.find(
      (item: any) => item.name === finalSelectedFunction
    );

    if (!selectedAbiFunction) {
      logError(params.isExternal || false, "Selected function is not available.");
      return {
        error: "Selected function is not available.",
        success: false,
      };
    }

    let args: any[] = params.args || [];
    if (
      !params.isExternal &&
      selectedAbiFunction.inputs &&
      selectedAbiFunction.inputs.length > 0
    ) {
      try {
        const argQuestions = selectedAbiFunction.inputs.map((input: any) => ({
          type: "input",
          name: input.name,
          message: `Enter the value for argument ${chalk.yellow(
            input.name
          )} (${chalk.yellow(input.type)}):`,
        }));

        const answers = await inquirer.prompt(argQuestions);
        args = selectedAbiFunction.inputs.map(
          (input: any) => answers[input.name]
        );
      } catch (error: any) {
        if (error.isTtyError) {
          logError(params.isExternal || false, "Interactive prompts are not supported in this environment. Please provide arguments via command line options.");
          return {
            error: "Interactive prompts not supported",
            success: false,
          };
        }
        throw error;
      }
    }
    try {
      if (finalSelectedType === FunctionType.READ) {
        spinner.start(`⏳ Calling ${finalSelectedFunction} function...`);
        const data = await publicClient.readContract({
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: finalSelectedFunction,
          args,
        });

        spinner.stop();
        if (data) {
          logSuccess(
            params.isExternal || false,
            `✅ Function ${finalSelectedFunction} called successfully!`
          );
          if (config.displayPreferences.compactMode) {
            spinner.succeed(chalk.green(`${data}`));
          } else {
            spinner.succeed(chalk.white(`🔧 Result: `) + chalk.green(data));
          }
          return {
            success: true,
            result: data,
          };
        }
      }

      let finalWalletClient;
      if (finalSelectedType === FunctionType.WRITE) {
        if (params.isExternal) {
          if (!params.name || !params.password || !params.walletsData) {
            logError(
              params.isExternal || false,
              "Wallet name, password and wallets data are required."
            );
            return {
              error: "Wallet name, password and wallets data are required.",
              success: false,
            };
          }
          finalWalletClient = await provider.getWalletClientExternal(
            params.walletsData,
            params.name,
            params.password,
            provider
          );
        } else {
          finalWalletClient = await provider.getWalletClient(params.name);
        }
        if (!finalWalletClient) {
          logError(params.isExternal || false, "Failed to get wallet client.");
          return {
            error: "Failed to get wallet client.",
            success: false,
          };
        }
        const account = finalWalletClient.account;

        if (!config.displayPreferences.compactMode) {
          logInfo(params.isExternal || false, `🔑 Wallet account: ${account?.address}`);
        }

        spinner.start(`⏳ Calling ${finalSelectedFunction} function...`);

       
        const gasConfig: any = {
          gas: config.defaultGasLimit ? BigInt(config.defaultGasLimit) : undefined
        };
        
        if (config.defaultGasPrice && config.defaultGasPrice > 0) {
          gasConfig.maxFeePerGas = BigInt(config.defaultGasPrice);
        }

        
        const contractParams = {
          account,
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: finalSelectedFunction,
          args,
          ...gasConfig
        };

        const hash = await finalWalletClient.writeContract(contractParams);

        spinner.stop();
        logSuccess(
          params.isExternal || false,
          `✅ Function ${finalSelectedFunction} called successfully!`
        );
        
        if (config.displayPreferences.compactMode) {
          spinner.succeed(chalk.green(`Transaction Hash: ${hash}`));
        } else {
          spinner.succeed(chalk.white(`🔧 Transaction Hash: `) + chalk.green(hash));
        }
        
        return {
          success: true,
          result: hash,
        };
      }
      if (!config.displayPreferences.compactMode && config.displayPreferences.showExplorerLinks) {
        logInfo(params.isExternal || false, `🔗 View on Explorer: ${explorerUrl}`);
      }
    } catch (error) {
      spinner.stop();
      throw error;
    }
  } catch (error: any) {
    logError(params.isExternal || false, `Error interacting with the bridge: ${error.message || error}`);
  }
}
