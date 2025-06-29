import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const mintTokens = new Command()
  .name('mint')
  .description('Mint ERC20 tokens to a specified address')
  .option('-c, --address <address>', 'Token contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-a, --amount <amount>', 'Amount of tokens to mint')
  .option('--testnet', 'Use testnet')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--private-key <key>', 'Private key')
  .action(async (options) => {
    try {
      // Get API key and private key using helper functions (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);
      const privateKey = await getPrivateKey(options.privateKey);

      // Start spinner after credentials are obtained
      const spinner = ora('Preparing mint operation...').start();

      // Get missing options through prompts if not provided
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'address',
          message: 'Enter token contract address:',
          when: !options.address,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Token contract address is required';
            }
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Token contract address must be a valid Ethereum address';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'to',
          message: 'Enter recipient address:',
          when: !options.to,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Recipient address is required';
            }
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Recipient address must be a valid Ethereum address';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'amount',
          message: 'Enter amount of tokens to mint:',
          when: !options.amount,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Amount is required';
            }
            const num = Number(input);
            if (isNaN(num) || num <= 0) {
              return 'Amount must be a positive number';
            }
            return true;
          }
        }
      ]);

      const tokenAddress = options.address || answers.address;
      const recipientAddress = options.to || answers.to;
      const amount = options.amount || answers.amount;

      spinner.text = 'Initializing Thirdweb SDK...';

      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        privateKey,
        options.testnet ? 'rootstock-testnet' : 'rootstock',
        {
          clientId: apiKey,
          rpcBatchSettings: {
            sizeLimit: 10,
            timeLimit: 1000
          }
        }
      );

      spinner.text = 'Getting token contract...';

      // Get the token contract
      const contract = await sdk.getContract(tokenAddress);

      spinner.text = 'Minting tokens...';

      // Mint tokens
      const tx = await contract.erc20.mintTo(recipientAddress, amount);

      spinner.succeed(chalk.green('Tokens minted successfully!'));
      console.log(chalk.blue('Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('Recipient:'), recipientAddress);
      console.log(chalk.blue('Amount:'), amount);
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error: any) {
      console.error(chalk.red('Failed to mint tokens'));
      
      if (error.message?.includes('timeout')) {
        console.log(chalk.yellow('\nThe request timed out. This could be due to:'));
        console.log(chalk.yellow('1. Network connectivity issues'));
        console.log(chalk.yellow('2. Thirdweb service being temporarily unavailable'));
        console.log(chalk.yellow('3. IPFS gateway being slow to respond'));
        console.log(chalk.yellow('\nPlease try again in a few minutes.'));
      } else {
        console.error(chalk.red('Error details:'), error.message || error);
      }
    }
  }); 