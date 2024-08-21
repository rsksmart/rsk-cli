import ViemProvider from '../utils/viemProvider.js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const walletFilePath = path.join(process.cwd(), 'rootstock-wallet.json');

export async function balanceCommand(testnet: boolean) {
  try {
    // Step 1: Check if the wallet file exists
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red('🚫 No saved wallet found. Please create a wallet first.'));
      return;
    }

    // Step 2: Read the wallet file and extract the address
    const walletData = JSON.parse(fs.readFileSync(walletFilePath, 'utf8'));
    const { address } = walletData;

    if (!address) {
      console.log(chalk.red('⚠️ No valid address found in the saved wallet.'));
      return;
    }

    // Step 3: Determine the network and create the public client using ViemProvider
    const network = testnet ? 'rootstockTestnet' : 'rootstock';
    const provider = new ViemProvider(network);  // Instantiate the ViemProvider class
    const client = await provider.getPublicClient();  // Get the public client

    // Step 4: Get the balance using viem
    const balance = await client.getBalance({ address });

    // Step 5: Convert the balance from wei to RBTC
    const rbtcBalance = Number(balance) / 10 ** 18;

    // Step 6: Output the balance in RBTC
    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(address));
    console.log(chalk.white(`🌐 Network:`), chalk.green(testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'));
    console.log(chalk.white(`💰 Current Balance:`), chalk.green(`${rbtcBalance} RBTC`));
    console.log(chalk.blue(`🔗 Ensure that transactions are being conducted on the correct network.`));

  } catch (error) {
    // Handle the error safely by checking its type
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error checking balance:'), chalk.yellow(error.message));
    } else {
      console.error(chalk.red('🚨 An unknown error occurred.'));
    }
  }
}
