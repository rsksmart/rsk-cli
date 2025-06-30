import { ethers } from 'ethers';
import axios from 'axios';

export async function fetchContractAbi(
  address: string,
  explorerUrl: string,
  isTestnet: boolean = false
): Promise<any[]> {
  // Define multiple explorers to try
  const explorers = isTestnet
    ? [
        'https://rootstock-testnet.blockscout.com', // Blockscout testnet
        'https://explorer.testnet.rootstock.io', // Official RSK testnet
      ]
    : [
        'https://explorer.rsk.co', // Official RSK mainnet
        'https://rootstock.blockscout.com', // Blockscout mainnet
      ];

  let lastError: Error | null = null;

  for (const explorer of explorers) {
    try {
      // Validate address format
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid contract address format: ${address}`);
      }

      const url = `${explorer}/api?module=contract&action=getabi&address=${address}`;
      console.log(`Fetching ABI from: ${url}`);

      const response = await axios.get(url);

      if (response.data.status !== '1') {
        const errorMessage = response.data.message || 'Unknown error';
        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('404')
        ) {
          lastError = new Error(
            `Contract not found or not verified on ${explorer}. Address: ${address}`
          );
          continue; // Try next explorer
        }
        throw new Error(`Explorer API error: ${errorMessage}`);
      }

      console.log(`✅ ABI found on: ${explorer}`);
      return JSON.parse(response.data.result);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          lastError = new Error(
            `Contract not found or not verified on ${explorer}. Address: ${address}`
          );
          continue; // Try next explorer
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          lastError = new Error(
            `Network error: Unable to connect to explorer at ${explorer}`
          );
          continue; // Try next explorer
        }
        lastError = new Error(
          `Network request failed for ${explorer}: ${error.message}`
        );
        continue; // Try next explorer
      }

      lastError = new Error(
        `Failed to fetch contract ABI from ${explorer}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      continue; // Try next explorer
    }
  }

  // If we get here, all explorers failed
  throw lastError || new Error('All explorers failed to fetch ABI');
}
