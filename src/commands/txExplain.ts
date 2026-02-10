import chalk from "chalk";
import { rootstock, rootstockTestnet } from "viem/chains";
import { ethers } from "ethers";
import { logError,logMessage, logSuccess, logWarning } from "../utils/logger.js";
import { EXPLORER } from "../constants/explorer.js";
import axios from "axios";

interface TxExplainOptions {
  testnet: boolean;
  txhash: `0x${string}`;
  raw: boolean;
  isExternal?: boolean;
}

export const txExplainCommand = async (options: TxExplainOptions) => {
  const { testnet, txhash, raw, isExternal = false } = options;
  const rpcUrl = testnet
    ? rootstockTestnet.rpcUrls.default.http[0]
    : rootstock.rpcUrls.default.http[0];
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  try {
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txhash),
      provider.getTransactionReceipt(txhash),
    ]);
    if (!tx || !receipt) {
      logError(isExternal, "Transaction or Receipt not found.");
      return;
    }
    const explorer = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
    const txExplorerUrl = `${explorer}/tx/${txhash}`;
    logMessage(isExternal, "\nTRANSACTION SUMMARY", chalk.bold.underline);

    const networkName = testnet ? "Rootstock Testnet" : "Rootstock Mainnet";
    logMessage(isExternal, `${chalk.blue("Network:")} ${chalk.gray(networkName)}`);

    const statusText = receipt.status === 1 ? "✅ Success" : "❌ Failed";
    logMessage(isExternal, `${chalk.blue("Status:")} ${statusText}`);
    logMessage(isExternal, `${chalk.blue("Block:")} ${receipt.blockNumber}`);
    logMessage(isExternal, `${chalk.blue("From:")} ${tx.from}`);
    logMessage(isExternal, `${chalk.blue("To:")} ${tx.to || "Contract Creation"}`);
    logMessage(isExternal, `${chalk.blue("Value:")} ${ethers.utils.formatEther(tx.value)} RBTC`);

    logMessage(isExternal, "\nEXECUTION DETAILS", chalk.bold.underline);

    if (tx.data === "0x") {
      logWarning(isExternal, "Nature: Simple RBTC Transfer");
    } else if (raw) {
      logMessage(isExternal, `${chalk.gray("Raw Calldata:")} ${tx.data}`);
    } else {
      await decodeExecutionTier(tx.data, tx.to!, testnet, isExternal);
    }

    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice || tx.gasPrice || ethers.BigNumber.from(0);
    const fee = gasUsed.mul(gasPrice);

    logMessage(isExternal, "\n⛽ RESOURCE USAGE", chalk.bold.underline);
    logMessage(isExternal, `${chalk.blue("Gas Used:")} ${gasUsed.toString()}`);
    logMessage(isExternal, `${chalk.blue("Fee Paid:")} ${ethers.utils.formatEther(fee)} RBTC`);

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
      const iface = new ethers.utils.Interface(abi);
      const decoded = iface.parseTransaction({ data: calldata });

      if (decoded) {
        logSuccess(isExternal, `Decoded via Verified ABI: ${decoded.name}()`);
        decoded.functionFragment.inputs.forEach((input, index) => {
          const value = decoded.args[index];
          const displayValue = ethers.BigNumber.isBigNumber(value) ? value.toString() : value;
          logMessage(isExternal, `   └─ ${input.name} (${input.type}): ${displayValue}`);
        });
        return;
      }
    }
  } catch (error) {

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
      const amount = ethers.BigNumber.from("0x" + calldata.slice(74));
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
  const baseUrl = `${explorer}/api`;

  try {
    const response = await axios.get(baseUrl, {
      params: { module: "contract", action: "getabi", address: address }
    });
    if (response.data.status === "1") return JSON.parse(response.data.result);
  } catch (e) {
    return null;
  }
  return null;
}
