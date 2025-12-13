import inquirer from "inquirer";
import ViemProvider from "../utils/viemProvider.js";
import { ContractResult } from "../utils/types.js";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type InquirerAnswers = {
  selectedFunction?: string;
  args?: string[];
};

type ContractCommandOptions = {
  address: `0x${string}`;
  testnet: boolean;
  isExternal?: boolean;
  functionName?: string;
  args?: string[];
};


function isValidAddress(address: string): boolean {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

export async function ReadContract(
  params: ContractCommandOptions
): Promise<ContractResult | void> {
  const isExternal = params.isExternal || false;
  const address = params.address.toLowerCase() as `0x${string}`;

  if (!isValidAddress(address)) {
    const errorMessage =
      "Invalid address format. Please provide a valid address.";
    logError(isExternal, `❌ ${errorMessage}`);
    return {
      error: errorMessage,
      success: false,
    };
  }

  logInfo(
    isExternal,
    `🔧 Initializing interaction on ${
      params.testnet ? "testnet" : "mainnet"
    }...`
  );

  const baseUrl = params.testnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  logInfo(isExternal, `🔎 Checking if contract ${address} is verified...`);

  const spinner = createSpinner(isExternal);
  spinner.start("⏳ Checking contract verification...");

  try {
    const response = await fetch(
      `${baseUrl}/api?module=verificationResults&action=getVerification&address=${address}`
    );

    if (!response.ok) {
      const errorMessage = "Error during verification check.";
      spinner.fail(errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const resData = await response.json();

    if (!resData.data) {
      const errorMessage = "Contract verification not found.";
      spinner.fail(errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const { abi } = resData.data;

    const readFunctions = abi.filter(
      (item: any) =>
        item.type === "function" &&
        (item.stateMutability === "view" || item.stateMutability === "pure")
    );

    if (readFunctions.length === 0) {
      const errorMessage = "No read functions found in the contract.";
      spinner.stop();
      logWarning(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    spinner.stop();

    let selectedFunction: string;
    let selectedAbiFunction: any;

    if (params.isExternal) {
      if (!params.functionName) {
        return {
          error: "Function name is required when using external mode.",
          success: false,
        };
      }

      selectedFunction = params.functionName;
      selectedAbiFunction = readFunctions.find(
        (item: any) => item.name === selectedFunction
      );

      if (!selectedAbiFunction) {
        return {
          error: `Function '${selectedFunction}' not found in contract.`,
          success: false,
        };
      }
    } else {
      const questions: any = [
        {
          type: "list",
          name: "selectedFunction",
          message: "Select a read function to call:",
          choices: [...readFunctions.map((item: any) => item.name)],
        },
      ];

      const answers = await inquirer.prompt<InquirerAnswers>(questions);
      selectedFunction = answers.selectedFunction!;

      logSuccess(isExternal, `📜 You selected: ${selectedFunction}`);

      selectedAbiFunction = readFunctions.find(
        (item: any) => item.name === selectedFunction
      );
    }

    let args: any[] = [];
    if (selectedAbiFunction.inputs && selectedAbiFunction.inputs.length > 0) {
      if (params.isExternal) {
        if (
          !params.args ||
          params.args.length !== selectedAbiFunction.inputs.length
        ) {
          return {
            error: `Function '${selectedFunction}' requires ${selectedAbiFunction.inputs.length} arguments.`,
            success: false,
          };
        }
        args = params.args;
      } else {
        const argQuestions = selectedAbiFunction.inputs.map((input: any) => ({
          type: "input",
          name: input.name,
          message: `Enter the value for argument ${input.name} (${input.type}):`,
        }));

        const answers = await inquirer.prompt(argQuestions);
        args = selectedAbiFunction.inputs.map(
          (input: any) => answers[input.name]
        );
      }
    }

    spinner.start("⏳ Calling read function...");

    const provider = new ViemProvider(params.testnet);
    const publicClient = await provider.getPublicClient();

    try {
      const data = await publicClient.readContract({
        address,
        abi,
        functionName: selectedFunction,
        args,
      });

      const explorerUrl = params.testnet
        ? `https://explorer.testnet.rootstock.io/address/${address}`
        : `https://explorer.rootstock.io/address/${address}`;

      spinner.stop();
      logSuccess(
        isExternal,
        `✅ Function ${selectedFunction} called successfully!`
      );
      logSuccess(isExternal, `🔧 Result: ${data}`);
      logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);

      return {
        success: true,
        data: {
          contractAddress: address,
          network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          functionName: selectedFunction,
          result: data,
          explorerUrl: explorerUrl,
        },
      };
    } catch (error) {
      const errorMessage = `Error while calling function ${selectedFunction}.`;
      spinner.fail(errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
  } catch (error) {
    const errorMessage = "Error during contract interaction.";
    spinner.fail(errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}
