import chalk from "chalk";
import { formatEther, decodeFunctionData, parseAbi, Hex, Abi } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import ViemProvider from "../utils/viemProvider.js";
import { EXPLORER } from "../constants/explorer.js";

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

function logMessage(
  params: TxExplainOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: TxExplainOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: TxExplainOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: TxExplainOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

export const txExplainCommand = async (params: TxExplainOptions) => {
  const { testnet, txhash, raw } = params;
  try {
    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: txhash }),
      publicClient.getTransactionReceipt({ hash: txhash }),
    ]);
    if (!tx || !receipt) {
      const errorMsg = "Transaction or Receipt not found.";
      logError(params, errorMsg);
      return { success: false, error: errorMsg };
    }
    const nativeCurrency = testnet ? rootstockTestnet.nativeCurrency.symbol : rootstock.nativeCurrency.symbol;

    const explorer = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
    const txExplorerUrl = `${explorer}/tx/${txhash}`;
    logMessage(params, "\nTRANSACTION SUMMARY", chalk.bold.underline);

    const networkName = testnet ? "Rootstock Testnet" : "Rootstock Mainnet";
    logMessage(params, `${chalk.blue("Network:")} ${chalk.gray(networkName)}`);

    const statusText = receipt.status === "success" ? "✅ Success" : "❌ Failed";
    logMessage(params, `${chalk.blue("Status:")} ${statusText}`);

    logMessage(params, `${chalk.blue("Block:")} ${receipt.blockNumber.toString()}`);
    logMessage(params, `${chalk.blue("From:")} ${tx.from}`);
    logMessage(params, `${chalk.blue("To:")} ${tx.to || "Contract Creation"}`);
    logMessage(params, `${chalk.blue("Value:")} ${formatEther(tx.value)} ${nativeCurrency}`);

    logMessage(params, "\nEXECUTION DETAILS", chalk.bold.underline);

    let nature: "Simple Transfer" | "Contract Deployment" | "Contract Interaction";
    let methodName: string | null = null;
    let decodedArgs: DecodedArg[] | null = null;

    if (tx.input === "0x") {
      nature = "Simple Transfer";
      logInfo(params, "Nature: Simple RBTC Transfer");
    } else if (!tx.input) {
      nature = "Contract Deployment";
      logInfo(params, "Nature: Smart Contract Deployment");
      if (receipt.contractAddress) {
        logMessage(params, `   └─ Deployed To: ${chalk.green(receipt.contractAddress)}`);
      }
      if (raw) {
        logMessage(params, `${chalk.gray("Raw Bytecode:")} ${tx.input}`);
      } else {
        const inputString = tx.input as string;
        const bytecodeSize = (inputString.length - 2) / 2;
        logMessage(params, `${chalk.gray("Bytecode Size:")} ${bytecodeSize} bytes`);
      }
    } else {
      nature = "Contract Interaction";
      if (raw) {
        logMessage(params, `${chalk.gray("Raw Calldata:")} ${tx.input}`);
      } else {
        const inputString = tx.input as string;
        if (inputString.length > 130) {
          logMessage(params, `${chalk.gray("Raw Calldata:")} ${inputString.slice(0, 130)}... [Truncated]`);
        } else {
          logMessage(params, `${chalk.gray("Raw Calldata:")} ${inputString}`);
        }
        const executionResult = await decodeExecutionTier(tx.input as string, tx.to!, testnet, params);
        if (executionResult) {
          methodName = executionResult.methodName;
          decodedArgs = executionResult.decodedArgs;
        }
      }
    }

    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice || tx.gasPrice || 0n;
    const fee = gasUsed * gasPrice;

    logMessage(params, "\n⛽ RESOURCE USAGE", chalk.bold.underline);
    logMessage(params, `${chalk.blue("Gas Used:")} ${gasUsed.toString()}`);
    logMessage(params, `${chalk.blue("Fee Paid:")} ${formatEther(fee)} ${nativeCurrency}`);
    logMessage(params, `\n${chalk.magenta("🔗 View on Explorer:")} ${txExplorerUrl}`);

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
    logError(params, errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function decodeExecutionTier(calldata: string, to: string, testnet: boolean, params: TxExplainOptions): Promise<{ methodName: string; decodedArgs: DecodedArg[] } | null> {
  const selector = calldata.slice(0, 10);
  logMessage(
    params,
    `${chalk.blue("Function Selector:")} ${selector}`
  );
  try {
    const abi = await fetchContractABI(to, testnet, params);
    if (abi) {
      const decoded = decodeFunctionData({
        abi,
        data: calldata as Hex
      });
      if (decoded) {
        logSuccess(params, `Decoded via Verified ABI: ${decoded.functionName}()`);

        const abiItem = abi.find((item: any) => item.name === decoded.functionName && item.type === 'function');
        if (abiItem && abiItem.type === 'function' && abiItem.inputs && decoded.args) {
          const argsArray = decoded.args as readonly any[];
          const parsedArgs: DecodedArg[] = [];

          abiItem.inputs.forEach((input, index) => {
            const value = argsArray[index];
            const displayValue = typeof value === "bigint" ? value.toString() : value;
            parsedArgs.push({ name: input.name || `arg${index}`, type: input.type, value: displayValue });
            logMessage(params, `   └─ ${chalk.blue(input.name || 'arg' + index)} (${input.type}): ${chalk.gray(displayValue)}`);
          });
          return { methodName: decoded.functionName, decodedArgs: parsedArgs };
        }
      }
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logInfo(
      params,
      `⚠️ ABI Decoding failed: ${errorMessage}. Falling back to signature database...`
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

    logSuccess(params, `Decoded via Signature DB: ${decoded.functionName}()`);

    const args = decoded.args as readonly any[];
    const parsedArgs: DecodedArg[] = [];
    if (decoded.functionName === "transfer" || decoded.functionName === "approve") {
      const targetName = decoded.functionName === "transfer" ? "to" : "spender";
      parsedArgs.push({ name: targetName, type: "address", value: String(args[0]) });
      parsedArgs.push({ name: "amount", type: "uint256", value: String(args[1]) });
      logMessage(params, `   └─ ${chalk.blue(decoded.functionName === "transfer" ? "to" : "spender")}: ${chalk.gray(args[0])}`);
      logMessage(params, `   └─ ${chalk.blue("amount")}: ${chalk.gray(args[1].toString())}`);
    } else if (decoded.functionName === "transferFrom") {
      parsedArgs.push({ name: "from", type: "address", value: String(args[0]) });
      parsedArgs.push({ name: "to", type: "address", value: String(args[1]) });
      parsedArgs.push({ name: "amount", type: "uint256", value: String(args[2]) });

      logMessage(params, `   └─ ${chalk.blue("from")}: ${chalk.gray(args[0])}`);
      logMessage(params, `   └─ ${chalk.blue("to")}: ${chalk.gray(args[1])}`);
      logMessage(params, `   └─ ${chalk.blue("amount")}: ${chalk.gray(args[2].toString())}`);
    }
    return { methodName: decoded.functionName, decodedArgs: parsedArgs };
  } catch (fallbackError) {
    logInfo(params, "⚠️ Method: Unknown (Unverified Contract or Malformed Data)");
  }
  return null;
}


async function fetchContractABI(address: string, testnet: boolean, params: TxExplainOptions): Promise<Abi | null> {
  const explorer = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
  const baseUrl = `${explorer}/api?module=contract&action=getabi&address=${address}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(baseUrl);
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === "1") {
      try {
        return JSON.parse(data.result);
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : String(parseError);
        logInfo(params, `⚠️ Invalid ABI JSON returned from Explorer: ${msg}`);
        return null;
      }
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') {
      logInfo(params, "⚠️ Explorer API request timed out after 10s.");
    } else {
      logInfo(params, `⚠️ Error connecting to Explorer API: ${msg}`);
    }
  }
  return null;
}
