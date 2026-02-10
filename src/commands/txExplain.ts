import chalk from "chalk";
import { createPublicClient, http, formatUnits, Address } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import { validateAndFormatAddressRSK } from "../utils/index.js";

interface TxExplainOptions {
  testnet: boolean;
  txhash: `0x${string}`;
  raw: boolean;
}

export const txExplainCommand = async (options: TxExplainOptions) => {
  const { testnet, txhash, raw } = options;
  console.log("explaining ",txhash);
}
