import chalk from "chalk";
import { createPublicClient, http, formatUnits, Address } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import { validateAndFormatAddressRSK } from "../utils/index.js";
import { ethers } from "ethers";
import { logError } from "../utils/logger.js";
import { EXPLORER } from "../constants/explorer.js";

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
    const explorerUrl = testnet ? EXPLORER.BLOCKSCOUT.testnet : EXPLORER.BLOCKSCOUT.mainnet;
    } catch (error) {

    }
  console.log("explaining ",txhash);
}
