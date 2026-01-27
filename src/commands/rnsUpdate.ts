import { RNS } from '@rsksmart/rns-sdk';
import chalk from 'chalk';


interface RnsUpdateOptions {
  domain: string;
  wallet: string;
  testnet?: boolean;
  address : string;
  content : string;
}

export async function rnsUpdateCommand(options: RnsUpdateOptions) {
  const { domain, wallet, address, testnet, content } = options;

  // Rootstock RPCs: 30 for Mainnet, 31 for Testnet
  const rpcUrl = testnet ? 'https://public-node.testnet.rsk.co' : 'https://public-node.rsk.co';
    console.log(domain);
  try {
    
  } catch (error) {
        
  }
}
