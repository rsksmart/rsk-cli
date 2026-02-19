import chalk from "chalk";
import { formatEther, decodeFunctionData, Hex } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import ViemProvider from "../utils/viemProvider.js";
import { logError, logMessage, logSuccess, logWarning } from "../utils/logger.js";
import { EXPLORER } from "../constants/explorer.js";

interface TxExplainOptions {
  testnet: boolean;
  txhash: `0x${string}`;
  raw: boolean;
  isExternal?: boolean;
}

export const txExplainCommand = async (options: TxExplainOptions) => {
  const { testnet, txhash, raw, isExternal = false } = options;
  try {
    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: txhash }),
      publicClient.getTransactionReceipt({ hash: txhash }),
    ]);
    if (!tx || !receipt) {
      logError(isExternal, "Transaction or Receipt not found.");
      return;
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

    if (tx.input === "0x") {
      logWarning(isExternal, "Nature: Simple RBTC Transfer");
    } else if (raw) {
      logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${tx.input}`);
    } else {
      await decodeExecutionTier(tx.input, tx.to!, testnet, isExternal);
    }

    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice || tx.gasPrice || 0n;
    const fee = gasUsed * gasPrice;

    logMessage(isExternal, "\n⛽ RESOURCE USAGE", chalk.bold.underline);
    logMessage(isExternal, `${chalk.blue("Gas Used:")} ${gasUsed.toString()}`);
    logMessage(isExternal, `${chalk.blue("Fee Paid:")} ${formatEther(fee)} ${nativeCurrency}`);

    logMessage(isExternal, `\n${chalk.magenta("🔗 View on Explorer:")} ${txExplorerUrl}`);
  } catch (error: any) {
    logError(isExternal, `Could not fetch transaction data: ${error.message}`);
  }
}

async function decodeExecutionTier(calldata: string, to: string, isTestnet: boolean, isExternal: boolean) {
  const selector = calldata.slice(0, 10);
  logMessage(
    isExternal,
    `${chalk.blue("Function Selector:")} ${chalk.white(selector)}`
  );
  try {
    const abi = await fetchContractABI(to, isTestnet);
    if (abi) {
      const decoded = decodeFunctionData({
        abi,
        data: calldata as Hex
      });
      if (decoded) {
        logSuccess(isExternal, `Decoded via Verified ABI: ${decoded.functionName}()`);

        const abiItem = abi.find((item: any) => item.name === decoded.functionName && item.type === 'function');
        if (abiItem && abiItem.inputs && decoded.args) {
          abiItem.inputs.forEach((input: any, index: number) => {
            const value = Array.isArray(decoded.args) ? decoded.args[index] : (decoded.args as any)[input.name];
            const displayValue = typeof value === "bigint" ? value.toString() : value;
            logMessage(isExternal, `   └─ ${input.name || 'arg' + index} (${input.type}): ${displayValue}`);
          });
        }
        return;
      }
    }
  } catch (error) {
    logWarning(
      isExternal,
      `⚠️ ABI Decoding failed: ${error.message || "Unknown error"}. Falling back to signature database...`
    );
  }
  const knownSignatures: Record<string, string> = {
    "0xa9059cbb": "transfer(address to, uint256 amount)",
    "0x095ea7b3": "approve(address spender, uint256 amount)",
    "0x23b872dd": "transferFrom(address from, address to, uint256 amount)",
    "0x70a08231": "balanceOf(address owner)"
  };
  if (knownSignatures[selector]) {
    logSuccess(isExternal, `Decoded via Signature DB: ${knownSignatures[selector]}`);

    if (selector === "0xa9059cbb") {
      const toAddress = "0x" + calldata.slice(34, 74);
      const amount = BigInt("0x" + calldata.slice(74));
      logMessage(isExternal, `   └─ to: ${toAddress}`);
      logMessage(isExternal, `   └─ amount: ${amount.toString()}`);
    }
  } else {
    logWarning(isExternal, "Method: Unknown (Unverified Contract)");
    logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${calldata}`);
  }
}


async function fetchContractABI(address: string, isTestnet: boolean): Promise<any | null> {
  const explorer = isTestnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
  const baseUrl = `${explorer}/api?module=contract&action=getabi&address=${address}`;

  try {
    const response = await fetch(baseUrl);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === "1") {
      return JSON.parse(data.result);
    }
  } catch (e) {
    return null;
  }
  return null;
}
