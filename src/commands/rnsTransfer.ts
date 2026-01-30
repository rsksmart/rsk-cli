import { RNS } from '@rsksmart/rns-sdk';
import chalk from 'chalk';


interface RnsTransferOptions {
  domain: string;
  wallet: string;
  testnet?: boolean;
  recipient : string;
}

export async function rnsTransferCommand(options: RnsTransferOptions) {
  const { domain, wallet, testnet, recipient } = options;

  // Rootstock RPCs: 30 for Mainnet, 31 for Testnet
  const rpcUrl = testnet ? 'https://public-node.testnet.rsk.co' : 'https://public-node.rsk.co';
    console.log(`transfer ownership of ${domain} to ${recipient}`);
  try {
    
  } catch (error) {
        
  }
}
