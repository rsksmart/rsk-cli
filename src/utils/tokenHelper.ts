import { Address, encodeFunctionData, PublicClient } from "viem";
import { erc20ABI } from "../constants/erc20ABI.js";
import { TOKENS } from "../constants/tokenAdress";

export function resolveTokenAddress(token: string, testnet: boolean): Address {
  return TOKENS[token][
    testnet ? "testnet" : "mainnet"
  ].toLowerCase() as Address;
}
export async function getTokenInfo(
  client: PublicClient,
  tokenAddress: Address,
  holderAddress: Address
): Promise<{
  balance: bigint;
  decimals: number;
  name: string;
  symbol: string;
}> {
  const [balance, decimals, name, symbol] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "balanceOf",
      args: [holderAddress],
    }),
    client.readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "decimals",
    }),
    client.readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "name",
    }) as Promise<string>,
    client.readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "symbol",
    }) as Promise<string>,
  ]);

  return {
    balance: balance as bigint,
    decimals: decimals as number,
    name: name,
    symbol: symbol,
  };
}

export async function isERC20Contract(
  client: PublicClient,
  address: Address
): Promise<boolean> {
  try {
    const checks = await Promise.all([
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20ABI,
            functionName: "totalSupply",
          }),
        })
        .then(() => true)
        .catch(() => false),
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20ABI,
            functionName: "decimals",
          }),
        })
        .then(() => true)
        .catch(() => false),

      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20ABI,
            functionName: "symbol",
          }),
        })
        .then(() => true)
        .catch(() => false),
    ]);

    const isERC20 = checks.every((check) => check === true);

    if (!isERC20) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking ERC20 contract:", error);
    return false;
  }
}
