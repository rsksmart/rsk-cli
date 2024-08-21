import ViemProvider from '../utils/viemProvider.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { Address } from 'viem';

const walletFilePath = path.join(process.cwd(), 'rootstock-wallet.json');

export async function transferCommand(testnet: boolean, toAddress: Address, value: number) {
  try {
    // Step 1: Check if the wallet file exists
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red('🚫 No saved wallet found. Please create a wallet first.'));
      return;
    }

    // Step 2: Read the wallet file and extract the wallet address
    const walletData = JSON.parse(fs.readFileSync(walletFilePath, 'utf8'));
    const { address: walletAddress } = walletData;

    if (!walletAddress) {
      console.log(chalk.red('⚠️ No valid address found in the saved wallet.'));
      return;
    }

    // Step 3: Determine the network and create the clients using ViemProvider
    const network = testnet ? 'rootstockTestnet' : 'rootstock';
    const provider = new ViemProvider(network);

    // Use the public client to get the balance
    const publicClient = await provider.getPublicClient();
    const balance = await publicClient.getBalance({ address: walletAddress });

    // Step 4: Convert the balance from wei to RBTC
    const rbtcBalance = Number(balance) / 10 ** 18;

    // Step 5: Output the balance in RBTC
    console.log(chalk.white(`📄 Wallet Address:`), chalk.green(walletAddress));
    console.log(chalk.white(`🎯 Recipient Address:`), chalk.green(toAddress));
    console.log(chalk.white(`💵 Amount to Transfer:`), chalk.green(`${value} RBTC`));
    console.log(chalk.white(`💰 Current Balance:`), chalk.green(`${rbtcBalance} RBTC`));

    // Step 6: Check if the balance is sufficient for the transfer
    if (rbtcBalance < value) {
      console.log(chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`));
      return;
    }

    // Step 7: Proceed with the transfer using the wallet client
    const walletClient = await provider.getWalletClient();

    // Ensure the account is retrieved properly
    const account = walletClient.account;
    if (!account) {
      console.log(chalk.red('⚠️ Failed to retrieve the account. Please ensure your wallet is correctly set up.'));
      return;
    }

    const txHash = await walletClient.sendTransaction({
      account: account, // Correctly include the account field
      chain: provider.chain, // Use the chain field from provider
      to: toAddress,
      value: BigInt(value * 10 ** 18), // Convert RBTC value to wei and then to bigint
    });

    // Step 8: Display transaction hash and wait for the transaction to be confirmed with a spinner
    console.log(chalk.white(`🔄 Transaction initiated. TxHash:`), chalk.green(txHash));
    const spinner = ora('⏳ Waiting for confirmation...').start();

    // Step 9: Wait for the transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    spinner.stop();

    // Step 10: Output relevant information from the receipt
    if (receipt.status === 'success') {
      console.log(chalk.green('✅ Transaction confirmed successfully!'));
      console.log(chalk.white(`📦 Block Number:`), chalk.green(receipt.blockNumber));
      console.log(chalk.white(`⛽ Gas Used:`), chalk.green(receipt.gasUsed.toString()));

      // Step 11: Provide a hyperlink-style reference to the explorer
      const explorerUrl = testnet 
        ? `https://rootstock-testnet.blockscout.com/tx/${txHash}`
        : `https://rootstock.blockscout.com/tx/${txHash}`;
      console.log(chalk.white(`🔗 View on Explorer:`), chalk.dim(`${explorerUrl}`));
    } else {
      console.log(chalk.red('❌ Transaction failed.'));
    }

  } catch (error) {
    // Handle the error safely by checking its type
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error during transfer:'), chalk.yellow(error.message));
    } else {
      console.error(chalk.red('🚨 An unknown error occurred.'));
    }
  }
}
