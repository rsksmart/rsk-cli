import { RNS } from '@rsksmart/rns-sdk';
import chalk from 'chalk';


interface RnsRegisterOptions {
  domain: string;
  wallet: string;
  testnet?: boolean;
}

export async function rnsRegisterCommand(options: RnsRegisterOptions) {
  const { domain, wallet, testnet } = options;

  // Rootstock RPCs: 30 for Mainnet, 31 for Testnet
  const rpcUrl = testnet ? 'https://public-node.testnet.rsk.co' : 'https://public-node.rsk.co';
    console.log(domain);
  try {
    
  } catch (error) {
        
  }
}
