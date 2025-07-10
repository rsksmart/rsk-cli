import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import ViemProvider from "../utils/viemProvider.js";
import { ContractResult } from "../utils/types.js";

type InquirerAnswers = {
  selectedFunction?: string;
  args?: string[];
};

function isValidAddress(address: string): boolean {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

export async function ReadContract(
  uppercaseAddress: `0x${string}`,
  testnet: boolean,
  _isExternal?: boolean,
  _functionName?: string,
  _args?: string[]
): Promise<ContractResult | void> {
  const address = uppercaseAddress.toLowerCase() as `0x${string}`;

  if (!isValidAddress(address)) {
    const errorMessage = "Invalid address format. Please provide a valid address.";
    if (_isExternal) {
      return {
        error: errorMessage,
        success: false,
      };
    } else {
      console.log(chalk.red(`❌ ${errorMessage}`));
      return;
    }
  }

  if (!_isExternal) {
    console.log(
      chalk.blue(
        `🔧 Initializing interaction on ${testnet ? "testnet" : "mainnet"}...`
      )
    );
  }

  const baseUrl = testnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  if (!_isExternal) {
    console.log(
      `🔎 Checking if contract ${chalk.green(`${address}`)} is verified...`
    );
  }

  const spinner = _isExternal ? ora({isEnabled: false}) : ora().start("Checking contract verification...");

  try {
    const response = await fetch(
      `${baseUrl}/api?module=verificationResults&action=getVerification&address=${address}`
    );

    if (!response.ok) {
      const errorMessage = "Error during verification check.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner?.fail(`❌ ${errorMessage}`);
        return;
      }
    }

    const resData = await response.json();

    if (!resData.data) {
      const errorMessage = "Contract verification not found.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner?.fail(`❌ ${errorMessage}`);
        return;
      }
    }

    const { abi } = resData.data;

    const readFunctions = abi.filter(
      (item: any) =>
        item.type === "function" &&
        (item.stateMutability === "view" || item.stateMutability === "pure")
    );

    if (readFunctions.length === 0) {
      const errorMessage = "No read functions found in the contract.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner?.stop();
        console.log(chalk.yellow(`⚠️ ${errorMessage}`));
        return;
      }
    }

    if (!_isExternal) {
      spinner?.stop();
    }

    let selectedFunction: string;
    let selectedAbiFunction: any;
    
    if (_isExternal) {
      if (!_functionName) {
        return {
          error: "Function name is required when using external mode.",
          success: false,
        };
      }
      
      selectedFunction = _functionName;
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

      console.log(
        chalk.green(`📜 You selected: ${chalk.cyan(selectedFunction)}\n`)
      );

      selectedAbiFunction = readFunctions.find(
        (item: any) => item.name === selectedFunction
      );
    }

    let args: any[] = [];
    if (selectedAbiFunction.inputs && selectedAbiFunction.inputs.length > 0) {
      if (_isExternal) {
        if (!_args || _args.length !== selectedAbiFunction.inputs.length) {
          return {
            error: `Function '${selectedFunction}' requires ${selectedAbiFunction.inputs.length} arguments.`,
            success: false,
          };
        }
        args = _args;
      } else {
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
    }

    if (!_isExternal) {
      spinner?.start("⏳ Calling read function...");
    }

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();

    try {
      const data = await publicClient.readContract({
        address,
        abi,
        functionName: selectedFunction,
        args,
      });

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/address/${address}`
        : `https://explorer.rootstock.io/address/${address}`;

      if (_isExternal) {
        return {
          success: true,
          data: {
            contractAddress: address,
            network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            functionName: selectedFunction,
            result: data,
            explorerUrl: explorerUrl,
          },
        };
      } else {
        spinner?.stop();
        console.log(
          chalk.green(`✅ Function ${selectedFunction} called successfully!`)
        );
        spinner?.succeed(chalk.white(`🔧 Result:`) + " " + chalk.green(data));
        
        console.log(
          chalk.white(`🔗 View on Explorer:`),
          chalk.dim(`${explorerUrl}`)
        );
      }
    } catch (error) {
      const errorMessage = `Error while calling function ${selectedFunction}.`;
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner?.fail(`❌ ${errorMessage}`);
      }
    }
  } catch (error) {
    const errorMessage = "Error during contract interaction.";
    if (_isExternal) {
      return {
        error: errorMessage,
        success: false,
      };
    } else {
      spinner?.fail(`❌ ${errorMessage}`);
    }
  }
}
