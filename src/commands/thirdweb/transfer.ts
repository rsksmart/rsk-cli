import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const transferTokens = new Command()
  .name('transfer')
  .description('Transfer ERC20 tokens to another address')
  .option('-c, --address <address>', 'Token contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-a, --amount <amount>', 'Amount to transfer')
  .option('--testnet', 'Use testnet')
  .action(async (options) => {
    const spinner = ora('Transferring tokens...').start();

    try {
      // Check if private key is set
      if (!process.env.PRIVATE_KEY) {
        spinner.fail(chalk.red('Private key not found. Please set PRIVATE_KEY in your .env file'));
        return;
      }

      // Check if Thirdweb API key is set
      if (!process.env.THIRDWEB_CLIENT_ID) {
        spinner.fail(chalk.red('Thirdweb API key not found. Please set THIRDWEB_CLIENT_ID in your .env file'));
        console.log(chalk.yellow('You can get an API key at https://thirdweb.com/create-api-key'));
        return;
      }

      // Get missing options through prompts if not provided
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'address',
          message: 'Enter token contract address:',
          when: !options.address,
          validate: (input) => input.startsWith('0x') && input.length === 42
        },
        {
          type: 'input',
          name: 'to',
          message: 'Enter recipient address:',
          when: !options.to,
          validate: (input) => input.startsWith('0x') && input.length === 42
        },
        {
          type: 'input',
          name: 'amount',
          message: 'Enter amount to transfer:',
          when: !options.amount,
          validate: (input) => !isNaN(Number(input)) && Number(input) > 0
        }
      ]);

      const tokenAddress = options.address || answers.address;
      const recipientAddress = options.to || answers.to;
      const amount = options.amount || answers.amount;

      spinner.text = 'Initializing Thirdweb SDK...';

      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        process.env.PRIVATE_KEY,
        options.testnet ? 'rootstock-testnet' : 'rootstock',
        {
          clientId: process.env.THIRDWEB_CLIENT_ID,
          rpcBatchSettings: {
            sizeLimit: 10,
            timeLimit: 1000
          }
        }
      );

      spinner.text = 'Getting token contract...';

      // Get the token contract
      const contract = await sdk.getContract(tokenAddress);

      spinner.text = 'Getting token details...';

      // Get token details
      const [name, symbol, decimals] = await Promise.all([
        contract.erc20.get(),
        contract.erc20.get(),
        contract.erc20.get()
      ]);

      spinner.text = 'Transferring tokens...';

      // Transfer tokens
      const tx = await contract.erc20.transfer(recipientAddress, amount);

      spinner.succeed(chalk.green('Tokens transferred successfully!'));
      console.log(chalk.blue('Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('From:'), await sdk.wallet.getAddress());
      console.log(chalk.blue('To:'), recipientAddress);
      console.log(chalk.blue('Amount:'), amount, symbol);
      console.log(chalk.blue('Token:'), name);
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get the explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to transfer tokens'));
      
      if (error.message?.includes('timeout')) {
        console.log(chalk.yellow('\nThe request timed out. This could be due to:'));
        console.log(chalk.yellow('1. Network connectivity issues'));
        console.log(chalk.yellow('2. Thirdweb service being temporarily unavailable'));
        console.log(chalk.yellow('3. IPFS gateway being slow to respond'));
        console.log(chalk.yellow('\nPlease try again in a few minutes.'));
      } else {
        console.error(error);
      }
    }
  }); 