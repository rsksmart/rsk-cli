import chalk from "chalk";
import { formatEther, decodeFunctionData, parseAbi, Hex, Abi } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import ViemProvider from "../utils/viemProvider.js";
import { EXPLORER } from "../constants/explorer.js";
import { logError, logSuccess, logInfo, logMessage } from "../utils/logger.js";

export interface TxExplainOptions {
  testnet: boolean;
  txhash: `0x${string}`;
  raw: boolean;
  isExternal?: boolean;
}

export interface DecodedArg {
  name: string;
  type: string;
  value: string;
}

export interface TxExplainResult {
  success: boolean;
  data?: {
    network: string;
    status: "success" | "reverted";
    block: string;
    from: string;
    to: string | null;
    value: string;
    gasUsed: string;
    feePaid: string;
    nature: "Simple Transfer" | "Contract Deployment" | "Contract Interaction";
    rawCalldata: string;
    methodName: string | null;
    decodedArgs: DecodedArg[] | null;
  };
  error?: string;
}

export const txExplainCommand = async (params: TxExplainOptions) => {
  const { testnet, txhash, raw, isExternal = false } = params;
  try {
    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: txhash }),
      publicClient.getTransactionReceipt({ hash: txhash }),
    ]);
    if (!tx || !receipt) {
      const errorMsg = "Transaction or Receipt not found.";
      logError(isExternal, errorMsg);
      return { success: false, error: errorMsg };
    }
    const nativeCurrency = testnet ? rootstockTestnet.nativeCurrency.symbol : rootstock.nativeCurrency.symbol;

    const explorer = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
    const txExplorerUrl = `${explorer}/tx/${txhash}`;
    logMessage(isExternal, "\nTRANSACTION SUMMARY", chalk.bold.underline);

    const networkName = testnet ? "Rootstock Testnet" : "Rootstock Mainnet";
    logMessage(isExternal, `${chalk.blue("Network:")} ${chalk.gray(networkName)}`);

    const statusText = receipt.status === "success" ? "✅ Success" : "❌ Failed";
    logMessage(isExternal, `${chalk.blue("Status:")} ${statusText}`);

    logMessage(isExternal, `${chalk.blue("Block:")} ${receipt.blockNumber.toString()}`);
    logMessage(isExternal, `${chalk.blue("From:")} ${tx.from}`);
    logMessage(isExternal, `${chalk.blue("To:")} ${tx.to || "Contract Creation"}`);
    logMessage(isExternal, `${chalk.blue("Value:")} ${formatEther(tx.value)} ${nativeCurrency}`);

    logMessage(isExternal, "\nEXECUTION DETAILS", chalk.bold.underline);

    let nature: "Simple Transfer" | "Contract Deployment" | "Contract Interaction";
    let methodName: string | null = null;
    let decodedArgs: DecodedArg[] | null = null;

    if (tx.input === "0x") {
      nature = "Simple Transfer";
      logInfo(isExternal, "Nature: Simple RBTC Transfer");
    } else if (!tx.to) {
      nature = "Contract Deployment";
      logInfo(isExternal, "Nature: Smart Contract Deployment");
      if (receipt.contractAddress) {
        logMessage(isExternal, `   └─ Deployed To: ${chalk.green(receipt.contractAddress)}`);
      }
      if (raw) {
        logMessage(isExternal, `${chalk.gray("Raw Bytecode:")} ${tx.input}`);
      } else {
        const inputString = tx.input as string;
        const bytecodeSize = (inputString.length - 2) / 2;
        logMessage(isExternal, `${chalk.gray("Bytecode Size:")} ${bytecodeSize} bytes`);
      }
    } else {
      nature = "Contract Interaction";
      if (raw) {
        logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${tx.input}`);
      } else {
        const inputString = tx.input as string;
        if (inputString.length > 130) {
          logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${inputString.slice(0, 130)}... [Truncated]`);
        } else {
          logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${inputString}`);
        }
        const executionResult = await decodeExecutionTier(tx.input as string, tx.to!, testnet, isExternal);
        if (executionResult.success) {
          methodName = executionResult.methodName;
          decodedArgs = executionResult.decodedArgs;
        } else if (executionResult.error && !executionResult.error.includes("Method: Unknown") && !executionResult.error.includes("Invalid ABI JSON")) {
          logError(isExternal, executionResult.error);
        }
      }
    }

    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice || tx.gasPrice || 0n;
    const fee = gasUsed * gasPrice;

    logMessage(isExternal, "\n⛽ RESOURCE USAGE", chalk.bold.underline);
    logMessage(isExternal, `${chalk.blue("Gas Used:")} ${gasUsed.toString()}`);
    logMessage(isExternal, `${chalk.blue("Fee Paid:")} ${formatEther(fee)} ${nativeCurrency}`);
    logMessage(isExternal, `\n${chalk.magenta("🔗 View on Explorer:")} ${txExplorerUrl}`);

    return {
      success: true,
      data: {
        network: networkName,
        status: receipt.status,
        block: receipt.blockNumber.toString(),
        from: tx.from,
        to: tx.to || null,
        value: formatEther(tx.value),
        gasUsed: gasUsed.toString(),
        feePaid: formatEther(fee),
        nature,
        rawCalldata: tx.input,
        methodName,
        decodedArgs
      }
    };
  } catch (error: any) {
    const errorMsg = `Could not fetch transaction data: ${error.message}`;
    logError(isExternal, errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function decodeExecutionTier(calldata: string, to: string, testnet: boolean, isExternal: boolean): Promise<{ methodName: string; decodedArgs: DecodedArg[]; success: true } | { error: string; success: false }> {
  const selector = calldata.slice(0, 10);
  logMessage(
    isExternal,
    `${chalk.blue("Function Selector:")} ${selector}`
  );
  try {
    const result = await fetchContractABI(to, testnet, isExternal);
    if (!result.success) {
      return result;
    }
    if (result.abi) {
      const abi = result.abi;
      const decoded = decodeFunctionData({
        abi,
        data: calldata as Hex
      });
      if (decoded) {
        logSuccess(isExternal, `Decoded via Verified ABI: ${decoded.functionName}()`);

        const abiItem = abi.find((item: any) => item.name === decoded.functionName && item.type === 'function');
        if (abiItem && abiItem.type === 'function' && abiItem.inputs && decoded.args) {
          const argsArray = decoded.args as readonly any[];
          const parsedArgs: DecodedArg[] = [];

          abiItem.inputs.forEach((input, index) => {
            const value = argsArray[index];
            const displayValue = typeof value === "bigint" ? value.toString() : value;
            parsedArgs.push({ name: input.name || `arg${index}`, type: input.type, value: displayValue });
            logMessage(isExternal, `   └─ ${chalk.blue(input.name || 'arg' + index)} (${input.type}): ${chalk.gray(displayValue)}`);
          });
          return { success: true, methodName: decoded.functionName, decodedArgs: parsedArgs };
        }
      }
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(
      isExternal,
      `ABI Decoding failed: ${errorMessage}. Falling back to signature database...`
    );
  }
  try {
    const fallbackAbi = parseAbi([
      "function transfer(address to, uint256 amount)",
      "function approve(address spender, uint256 amount)",
      "function transferFrom(address from, address to, uint256 amount)"
    ]);

    const decoded = decodeFunctionData({
      abi: fallbackAbi,
      data: calldata as Hex,
    });

    logSuccess(isExternal, `Decoded via Signature DB: ${decoded.functionName}()`);

    const args = decoded.args as readonly any[];
    const parsedArgs: DecodedArg[] = [];
    if (decoded.functionName === "transfer" || decoded.functionName === "approve") {
      const targetName = decoded.functionName === "transfer" ? "to" : "spender";
      parsedArgs.push({ name: targetName, type: "address", value: String(args[0]) });
      parsedArgs.push({ name: "amount", type: "uint256", value: String(args[1]) });
      logMessage(isExternal, `   └─ ${chalk.blue(decoded.functionName === "transfer" ? "to" : "spender")}: ${chalk.gray(args[0])}`);
      logMessage(isExternal, `   └─ ${chalk.blue("amount")}: ${chalk.gray(args[1].toString())}`);
    } else if (decoded.functionName === "transferFrom") {
      parsedArgs.push({ name: "from", type: "address", value: String(args[0]) });
      parsedArgs.push({ name: "to", type: "address", value: String(args[1]) });
      parsedArgs.push({ name: "amount", type: "uint256", value: String(args[2]) });

      logMessage(isExternal, `   └─ ${chalk.blue("from")}: ${chalk.gray(args[0])}`);
      logMessage(isExternal, `   └─ ${chalk.blue("to")}: ${chalk.gray(args[1])}`);
      logMessage(isExternal, `   └─ ${chalk.blue("amount")}: ${chalk.gray(args[2].toString())}`);
    }
    return { success: true, methodName: decoded.functionName, decodedArgs: parsedArgs };
  } catch (fallbackError) {
    const errorMsg = "Method: Unknown (Unverified Contract or Malformed Data)";
    logError(isExternal, errorMsg);
    return { success: false, error: errorMsg };
  }
}


async function fetchContractABI(address: string, testnet: boolean, isExternal: boolean): Promise<{ abi: Abi; success: true } | { error: string; success: false } | { abi: null; success: true }> {
  const explorer = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
  const baseUrl = `${explorer}/api?module=contract&action=getabi&address=${address}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Explorer API returned HTTP ${response.status}`
      };
    }
    const data = await response.json();
    if (data.status === "1") {
      try {
        return { abi: JSON.parse(data.result) as Abi, success: true };
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : String(parseError);
        logError(isExternal, `Invalid ABI JSON returned from Explorer: ${msg}`);
        return {
          success: false,
          error: `Invalid ABI JSON returned from Explorer: ${msg}`
        };
      }
    }
    return { abi: null, success: true };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error.name === 'AbortError'
      ? "Request to Explorer timed out after 10s"
      : error.message || String(error);

    return {
      success: false,
      error: `Connection Error: ${msg}`
    };
  }
}
