import inquirer from "inquirer";
import { parseEther, formatEther } from "viem";
import ViemProvider from "../utils/viemProvider.js";
import { ContractResult } from "../utils/types.js";
import { getExplorerUrl } from "../utils/constants.js";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

type ContractCommandOptions = {
  address: `0x${string}`;
  testnet: boolean;
  write?: boolean;
  wallet?: string;
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
  const intMatch = solidityType.match(/^(u?)int(\d+)?$/);
  if (intMatch) {
    const isUnsigned = intMatch[1] === "u";
    const bits = intMatch[2] ? parseInt(intMatch[2], 10) : 256;
    let parsed: bigint;
    try {
      parsed = BigInt(value);
    } catch {
      throw new Error(`Invalid integer value for type ${solidityType}: ${value}`);
    }
    if (isUnsigned) {
      if (parsed < 0n) throw new Error(`Type ${solidityType} cannot be negative`);
      if (parsed >= 2n ** BigInt(bits)) throw new Error(`Value ${value} exceeds maximum for ${solidityType}`);
    } else {
      const min = -(2n ** BigInt(bits - 1));
      const max = 2n ** BigInt(bits - 1) - 1n;
      if (parsed < min || parsed > max) throw new Error(`Value ${value} is out of range for ${solidityType}`);
    }
    return parsed;
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
  const bytesMatch = solidityType.match(/^bytes(\d+)?$/);
  if (bytesMatch) {
    if (!/^0x[a-fA-F0-9]*$/.test(value))
      throw new Error(`Invalid hex for type ${solidityType}: ${value}`);
    const n = bytesMatch[1] ? parseInt(bytesMatch[1], 10) : null;
    if (n !== null) {
      const expectedLen = 2 + n * 2;
      if (value.length !== expectedLen)
        throw new Error(
          `Type ${solidityType} requires exactly ${n} bytes (${expectedLen} hex chars including 0x), got ${value.length}`
        );
    }
    return value;
  }
  if (/^u?fixed(\d+x\d+)?$/.test(solidityType)) {
    return value;
  }
  return value;
}

function validateAbi(abi: any): boolean {
  if (!Array.isArray(abi)) return false;
  for (const item of abi) {
    if (typeof item !== "object" || item === null) return false;
    if (typeof item.type !== "string") return false;
    if (item.type === "function") {
      if (typeof item.name !== "string") return false;
      if (!Array.isArray(item.inputs)) return false;
      if (typeof item.stateMutability !== "string") return false;
      for (const input of item.inputs) {
        if (typeof input.type !== "string") return false;
      }
    }
  }
  return true;
}

export async function contractCommand(
  params: ContractCommandOptions
): Promise<ContractResult | void> {
  const isExternal = params.isExternal || false;
  const address = params.address.toLowerCase() as `0x${string}`;

  if (!isValidAddress(address)) {
    const errorMessage =
      "Invalid address format. Please provide a valid address.";
    logError(isExternal, `❌ ${errorMessage}`);
    return { error: errorMessage, success: false };
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
      return { error: errorMessage, success: false };
    }

    const resData = await response.json();

    if (!resData.data) {
      const errorMessage = "Contract verification not found.";
      spinner.fail(errorMessage);
      return { error: errorMessage, success: false };
    }

    const { abi } = resData.data;

    if (!validateAbi(abi)) {
      const errorMessage = "Contract ABI from API is malformed or invalid.";
      spinner.fail(errorMessage);
      return { error: errorMessage, success: false };
    }

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

      const fnSignature = (item: any) => {
        const paramTypes = (item.inputs ?? []).map((i: any) => i.type).join(",");
        return `${item.name}(${paramTypes})`;
      };

      const { selectedSig } = await inquirer.prompt<{ selectedSig: string }>([
        {
          type: "list",
          name: "selectedSig",
          message: "Select a write function to call:",
          choices: writeFunctions.map(fnSignature),
        },
      ]);

      const selectedAbiWriteFn = writeFunctions.find(
        (item: any) => fnSignature(item) === selectedSig
      );

      if (!selectedAbiWriteFn) {
        logError(isExternal, "Selected function not found in ABI.");
        return { error: "Selected function not found in ABI.", success: false };
      }

      const selectedWriteFn = selectedAbiWriteFn.name;
      logSuccess(isExternal, `📜 You selected: ${selectedSig}`);

      let writeArgs: any[] = [];
      if (selectedAbiWriteFn.inputs?.length > 0) {
        const argAnswers = await inquirer.prompt(
          selectedAbiWriteFn.inputs.map((input: any, idx: number) => ({
            type: "input",
            name: `arg_${idx}`,
            message: `Enter value for ${input.name || `arg${idx}`} (${input.type}):`,
          }))
        );
        try {
          writeArgs = selectedAbiWriteFn.inputs.map((input: any, idx: number) =>
            coerceArg(argAnswers[`arg_${idx}`], input.type)
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
        if (!/^\d+(\.\d+)?$/.test(rbtcValue)) {
          logError(isExternal, "Invalid RBTC value. Use decimal format (e.g. 0.01).");
          return { error: "Invalid RBTC value.", success: false };
        }
        let parsedEther: bigint;
        try {
          parsedEther = parseEther(rbtcValue);
        } catch {
          logError(isExternal, "Invalid RBTC value. Could not parse amount.");
          return { error: "Invalid RBTC value.", success: false };
        }
        if (parsedEther <= 0n) {
          logError(isExternal, "RBTC value must be greater than zero.");
          return { error: "Invalid RBTC value.", success: false };
        }
        payableValue = parsedEther;
      }

      const provider = new ViemProvider(params.testnet);
      const publicClient = await provider.getPublicClient();
      const { client: walletClient } = await provider.getWalletClientWithPassword(params.wallet);
      if (!walletClient.account) {
        logError(isExternal, "Wallet account not available.");
        return { error: "Wallet account not available.", success: false };
      }
      const account = walletClient.account;

      if (payableValue !== undefined) {
        const balance = await publicClient.getBalance({ address: account.address });
        if (balance < payableValue) {
          logError(
            isExternal,
            `Insufficient RBTC balance. Have ${formatEther(balance)} RBTC, need ${formatEther(payableValue)} RBTC.`
          );
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
        const userMsg = isExternal
          ? "Transaction simulation reverted."
          : err.shortMessage || err.message || "Simulation reverted.";
        logError(isExternal, userMsg);
        return { error: userMsg, success: false };
      }

      spinner.succeed("✅ Simulation passed.");

      logInfo(isExternal, `\n📋 Transaction summary:`);
      logInfo(isExternal, `   Function : ${selectedSig}`);
      if (writeArgs.length > 0) {
        logInfo(isExternal, `   Arguments: ${writeArgs.map(String).join(", ")}`);
      }
      if (payableValue !== undefined) {
        logInfo(isExternal, `   Value    : ${formatEther(payableValue)} RBTC`);
      }
      logInfo(isExternal, `   Network  : ${params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet"}`);

      const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
          type: "confirm",
          name: "confirmed",
          message: "Proceed with transaction?",
          default: false,
        },
      ]);

      if (!confirmed) {
        logWarning(isExternal, "Transaction cancelled by user.");
        return { error: "Transaction cancelled.", success: false };
      }

      spinner.start("⏳ Submitting transaction...");

      let txHash: `0x${string}`;
      try {
        txHash = await walletClient.writeContract(simulateRequest);
      } catch (err: any) {
        spinner.fail("❌ Submission failed.");
        const submitMsg = isExternal
          ? "Transaction submission failed."
          : err.shortMessage || err.message || "Failed to submit transaction.";
        logError(isExternal, submitMsg);
        return { error: submitMsg, success: false };
      }

      spinner.stop();
      logSuccess(isExternal, `🔄 Transaction submitted. Hash: ${txHash}`);

      spinner.start("⏳ Waiting for confirmation...");

      let receipt: any;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      } catch (err: any) {
        spinner.stop();
        logWarning(
          isExternal,
          `⚠️  Could not confirm receipt. Check status manually with: rsk-cli tx --txid ${txHash}`
        );
        return { error: "Receipt polling failed.", success: false };
      }

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
      return { error: errorMessage, success: false };
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
      const readFnSignature = (item: any) => {
        const paramTypes = (item.inputs ?? []).map((i: any) => i.type).join(",");
        return `${item.name}(${paramTypes})`;
      };

      const { selectedReadSig } = await inquirer.prompt<{ selectedReadSig: string }>([
        {
          type: "list",
          name: "selectedReadSig",
          message: "Select a read function to call:",
          choices: readFunctions.map(readFnSignature),
        },
      ]);

      selectedAbiFunction = readFunctions.find(
        (item: any) => readFnSignature(item) === selectedReadSig
      );

      if (!selectedAbiFunction) {
        return { error: "Selected function not found in ABI.", success: false };
      }

      selectedFunction = selectedAbiFunction.name;
      logSuccess(isExternal, `📜 You selected: ${selectedReadSig}`);
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
        const argQuestions = selectedAbiFunction.inputs.map((input: any, idx: number) => ({
          type: "input",
          name: `arg_${idx}`,
          message: `Enter the value for argument ${input.name || `arg${idx}`} (${input.type}):`,
        }));

        const answers = await inquirer.prompt(argQuestions);
        args = selectedAbiFunction.inputs.map(
          (_input: any, idx: number) => answers[`arg_${idx}`]
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
      return { error: errorMessage, success: false };
    }
  } catch (error) {
    const errorMessage = "Error during contract interaction.";
    spinner.fail(errorMessage);
    return { error: errorMessage, success: false };
  }
}

export const ReadContract = contractCommand;
