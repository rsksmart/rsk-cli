import inquirer from "inquirer";
import { parseEther, formatEther } from "viem";
import ViemProvider from "../utils/viemProvider.js";
import { ContractResult } from "../utils/types.js";
import { getExplorerUrl } from "../utils/constants.js";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type InquirerAnswers = {
  selectedFunction?: string;
  args?: string[];
};

type ContractCommandOptions = {
  address: `0x${string}`;
  testnet: boolean;
  write?: boolean;
  isExternal?: boolean;
  functionName?: string;
  args?: string[];
};


function isValidAddress(address: string): boolean {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

function coerceArg(value: string, solidityType: string): any {
  if (solidityType.endsWith("[]") || solidityType.startsWith("tuple")) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Expected JSON for type ${solidityType}, got: ${value}`);
    }
  }
  if (/^u?int(\d+)?$/.test(solidityType)) {
    return BigInt(value);
  }
  if (solidityType === "address") {
    if (!isValidAddress(value)) throw new Error(`Invalid address: ${value}`);
    return value;
  }
  if (solidityType === "bool") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Invalid bool: "${value}". Use "true" or "false".`);
  }
  if (/^bytes(\d+)?$/.test(solidityType)) {
    if (!/^0x[a-fA-F0-9]*$/.test(value))
      throw new Error(`Invalid hex for type ${solidityType}: ${value}`);
    return value;
  }
  return value;
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

    if (params.write) {
      spinner.stop();

      const writeFunctions = abi.filter(
        (item: any) =>
          item.type === "function" &&
          (item.stateMutability === "nonpayable" ||
            item.stateMutability === "payable")
      );

      if (writeFunctions.length === 0) {
        logWarning(isExternal, "No write functions found in this contract.");
        return { error: "No write functions found in this contract.", success: false };
      }

      const { selectedWriteFn } = await inquirer.prompt<{ selectedWriteFn: string }>([
        {
          type: "list",
          name: "selectedWriteFn",
          message: "Select a write function to call:",
          choices: writeFunctions.map((item: any) => item.name),
        },
      ]);

      logSuccess(isExternal, `📜 You selected: ${selectedWriteFn}`);

      const selectedAbiWriteFn = writeFunctions.find(
        (item: any) => item.name === selectedWriteFn
      );

      let writeArgs: any[] = [];
      if (selectedAbiWriteFn.inputs?.length > 0) {
        const argAnswers = await inquirer.prompt(
          selectedAbiWriteFn.inputs.map((input: any) => ({
            type: "input",
            name: input.name,
            message: `Enter value for ${input.name} (${input.type}):`,
          }))
        );
        try {
          writeArgs = selectedAbiWriteFn.inputs.map((input: any) =>
            coerceArg(argAnswers[input.name], input.type)
          );
        } catch (err: any) {
          logError(isExternal, `Invalid input: ${err.message}`);
          return { error: err.message, success: false };
        }
      }

      let payableValue: bigint | undefined;
      if (selectedAbiWriteFn.stateMutability === "payable") {
        const { rbtcValue } = await inquirer.prompt<{ rbtcValue: string }>([
          {
            type: "input",
            name: "rbtcValue",
            message: "RBTC value to send (e.g. 0.01):",
          },
        ]);
        const parsed = parseFloat(rbtcValue);
        if (isNaN(parsed) || parsed <= 0) {
          logError(isExternal, "Invalid RBTC value. Enter a positive number (e.g. 0.01).");
          return { error: "Invalid RBTC value.", success: false };
        }
        payableValue = parseEther(rbtcValue);
      }

      const provider = new ViemProvider(params.testnet);
      const publicClient = await provider.getPublicClient();
      const { client: walletClient } = await provider.getWalletClientWithPassword();
      const account = walletClient.account!;

      if (payableValue !== undefined) {
        const balance = await publicClient.getBalance({ address: account.address });
        if (balance < payableValue) {
          logError(isExternal, `Insufficient RBTC balance. Have ${formatEther(balance)} RBTC, need ${formatEther(payableValue)} RBTC.`);
          return { error: "Insufficient RBTC balance.", success: false };
        }
      }

      spinner.start("⏳ Simulating transaction...");

      let simulateRequest: any;
      try {
        const { request } = await publicClient.simulateContract({
          account,
          address,
          abi,
          functionName: selectedWriteFn,
          args: writeArgs,
          ...(payableValue !== undefined && { value: payableValue }),
        });
        simulateRequest = request;
      } catch (err: any) {
        spinner.fail("❌ Simulation failed.");
        logError(isExternal, err.shortMessage || err.message || "Simulation reverted.");
        return { error: err.shortMessage || err.message, success: false };
      }

      spinner.succeed("✅ Simulation passed.");
      spinner.start("⏳ Submitting transaction...");

      const txHash = await walletClient.writeContract(simulateRequest);
      spinner.stop();
      logSuccess(isExternal, `🔄 Transaction submitted. Hash: ${txHash}`);

      spinner.start("⏳ Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      spinner.stop();

      const explorerUrl = getExplorerUrl(params.testnet, "tx", txHash);

      if (receipt.status === "success") {
        logSuccess(isExternal, "✅ Transaction confirmed!");
        logInfo(isExternal, `📦 Block: ${receipt.blockNumber}`);
        logInfo(isExternal, `⛽ Gas used: ${receipt.gasUsed}`);
        logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);
        return {
          success: true,
          data: {
            contractAddress: address,
            network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
            functionName: selectedWriteFn,
            result: txHash,
            explorerUrl,
          },
        };
      } else {
        logError(isExternal, "❌ Transaction failed.");
        return { error: "Transaction failed.", success: false };
      }
    }

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
