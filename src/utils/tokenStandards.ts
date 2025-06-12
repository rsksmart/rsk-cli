import { Address, PublicClient, encodeFunctionData, WalletClient } from "viem";
import { erc20Abi, erc721Abi } from "viem";

export enum TokenStandard {
  ERC20 = "ERC20",
  ERC721 = "ERC721",
  UNKNOWN = "UNKNOWN"
}

export interface TokenInfo {
  standard: TokenStandard;
  name: string;
  symbol: string;
  decimals?: number;
  balance: bigint;
}

export async function detectTokenStandard(
  client: PublicClient,
  address: Address
): Promise<TokenStandard> {
  try {
    // First check for ERC20
    const erc20Checks = await Promise.all([
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "totalSupply",
          }),
        })
        .then(() => true)
        .catch(() => false),
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "decimals",
          }),
        })
        .then(() => true)
        .catch(() => false),
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        })
        .then(() => true)
        .catch(() => false),
    ]);

    if (erc20Checks.every(check => check)) {
      return TokenStandard.ERC20;
    }

    // Then check for ERC721
    const erc721Checks = await Promise.all([
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc721Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        })
        .then(() => true)
        .catch(() => false),
      client
        .call({
          to: address,
          data: encodeFunctionData({
            abi: erc721Abi,
            functionName: "name",
          }),
        })
        .then(() => true)
        .catch(() => false),
    ]);

    if (erc721Checks.every(check => check)) {
      return TokenStandard.ERC721;
    }

    return TokenStandard.UNKNOWN;
  } catch (error) {
    console.error("Error detecting token standard:", error);
    return TokenStandard.UNKNOWN;
  }
}

export async function getTokenInfo(
  client: PublicClient,
  tokenAddress: Address,
  holderAddress: Address
): Promise<TokenInfo> {
  const standard = await detectTokenStandard(client, tokenAddress);

  switch (standard) {
    case TokenStandard.ERC20:
      const [balance, decimals, name, symbol] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [holderAddress],
        }),
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "name",
        }) as Promise<string>,
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }) as Promise<string>,
      ]);

      return {
        standard,
        name,
        symbol,
        decimals: decimals as number,
        balance: balance as bigint,
      };

    case TokenStandard.ERC721:
      const [nftName, nftSymbol, nftBalance] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: erc721Abi,
          functionName: "name",
        }) as Promise<string>,
        client.readContract({
          address: tokenAddress,
          abi: erc721Abi,
          functionName: "symbol",
        }) as Promise<string>,
        client.readContract({
          address: tokenAddress,
          abi: erc721Abi,
          functionName: "balanceOf",
          args: [holderAddress],
        }),
      ]);

      return {
        standard,
        name: nftName,
        symbol: nftSymbol,
        balance: nftBalance as bigint,
      };

    default:
      throw new Error("Unsupported token standard");
  }
}

export async function transferToken(
  client: PublicClient,
  tokenAddress: Address,
  toAddress: Address,
  value: bigint,
  tokenId?: bigint,
  fromAddress?: Address
): Promise<{ request: any }> {
  try {
    const standard = await detectTokenStandard(client, tokenAddress);

    switch (standard) {
      case TokenStandard.ERC20:
        // Create the contract call directly without simulation
        return {
          request: {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "transfer",
            args: [toAddress, value],
          }
        };

      case TokenStandard.ERC721:
        if (!tokenId) {
          throw new Error("Token ID is required for ERC721 transfers");
        }
        if (!fromAddress) {
          throw new Error("From address is required for ERC721 transfers");
        }
        return {
          request: {
            address: tokenAddress,
            abi: erc721Abi,
            functionName: "transferFrom",
            args: [fromAddress, toAddress, tokenId],
          }
        };

      default:
        throw new Error("Unsupported token standard for transfer");
    }
  } catch (error: any) {
    if (error.message.includes("transaction reverted")) {
      throw new Error("Transaction would revert. Please check your balance and try again.");
    }
    throw error;
  }
} 