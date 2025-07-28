import precompiled from "@rsksmart/rsk-precompiled-abis";
import chalk from "chalk";
import { formatBridgeFragments } from "../utils/index.js";
import inquirer from "inquirer";
import { ALLOWED_BRIDGE_METHODS } from "../utils/constants.js";
import ViemProvider from "../utils/viemProvider.js";
import ora from "ora";
import { WalletData } from "../utils/types.js";

type InquirerAnswers = {
  selectedType?: FunctionType;
  selectedFunction?: string;
  args?: string[];
};
type BridgeCommandOptions = {
  testnet: boolean;
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

function logMessage(
  params: BridgeCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logInfo(params: BridgeCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}
function logError(params: BridgeCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}
function logSuccess(params: BridgeCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function startSpinner(
  params: BridgeCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: BridgeCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: BridgeCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

export async function bridgeCommand(params: BridgeCommandOptions) {
  try {
    const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
    logInfo(
      params,
      `🔧 Initializing bridge for ${params.testnet ? "testnet" : "mainnet"}...`
    );

    const bridge = {
      address: precompiled.bridge.address,
      abi: formatBridgeFragments(precompiled.bridge.abi),
    };
    let finalSelectedType: FunctionType | undefined = params.selectedType;
    if (!params.isExternal) {
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
    }

    if (!finalSelectedType) {
      logError(params, "Selected type is required.");
      return {
        error: "Selected type is required.",
        success: false,
      };
    }

    const provider = new ViemProvider(params.testnet);
    const publicClient = await provider.getPublicClient();

    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/address/${bridge.address}`
      : `https://explorer.rootstock.io/address/${bridge.address}`;

    const functions = ALLOWED_BRIDGE_METHODS[finalSelectedType!];

    let finalSelectedFunction: string | undefined = params.functionName;
    if (!params.isExternal) {
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
    }
    if (!finalSelectedFunction) {
      logError(params, "Selected function is required.");
      return {
        error: "Selected function is required.",
        success: false,
      };
    }

    const selectedAbiFunction = bridge.abi.find(
      (item: any) => item.name === finalSelectedFunction
    );

    if (!selectedAbiFunction) {
      logError(params, "Selected function is not available.");
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
    }
    try {
      if (finalSelectedType === FunctionType.READ) {
        startSpinner(
          params,
          spinner,
          `⏳ Calling ${finalSelectedFunction} function...`
        );
        const data = await publicClient.readContract({
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: finalSelectedFunction,
          args,
        });

        stopSpinner(params, spinner);
        if (data) {
          logSuccess(
            params,
            `✅ Function ${finalSelectedFunction} called successfully!`
          );
          succeedSpinner(
            params,
            spinner,
            chalk.white(`🔧 Result: `) + chalk.green(data)
          );
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
              params,
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
          logError(params, "Failed to get wallet client.");
          return {
            error: "Failed to get wallet client.",
            success: false,
          };
        }
        const account = finalWalletClient.account;

        logInfo(params, `🔑 Wallet account: ${account?.address}`);

        startSpinner(
          params,
          spinner,
          `⏳ Calling ${finalSelectedFunction} function...`
        );

        const { request, result } = await publicClient.simulateContract({
          account,
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: finalSelectedFunction,
          args,
        });

        await finalWalletClient.writeContract(request);

        stopSpinner(params, spinner);
        logSuccess(
          params,
          `✅ Function ${finalSelectedFunction} called successfully!`
        );
        if (result) {
          succeedSpinner(
            params,
            spinner,
            chalk.white(`🔧 Result: `) + chalk.green(result)
          );
          return {
            success: true,
            result,
          };
        }
      }
      logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
    } catch (error) {
      stopSpinner(params, spinner);
      throw error;
    }
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error interacting with the bridge: "),
      chalk.yellow(error.message || error)
    );
  }
}
