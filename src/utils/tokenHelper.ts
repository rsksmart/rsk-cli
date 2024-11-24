import { Address } from "viem";
import ViemProvider from "./viemProvider";
import { erc20ABI } from "../constants/erc20ABI.js";

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
}

export async function getTokenInfo(
  provider: ViemProvider,
  contractAddress: Address
): Promise<TokenInfo> {
  const client = await provider.getPublicClient();

  const [name, symbol, decimals] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: erc20ABI,
      functionName: "name",
    }) as Promise<string>,
    client.readContract({
      address: contractAddress,
      abi: erc20ABI,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: contractAddress,
      abi: erc20ABI,
      functionName: "decimals",
    }) as Promise<number>,
  ]);

  return { name, symbol, decimals };
}
