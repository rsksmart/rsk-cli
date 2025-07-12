import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const transferTokens = new Command()
  .name('transfer')
  .description('Transfer ERC20 tokens to another address')
  .option('-c, --address <address>', 'Token contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-a, --amount <amount>', 'Amount to transfer')
  .option('--testnet', 'Use testnet')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--private-key <key>', 'Private key')
  .action(async (options) => {
    try {
      // Get API key and private key using helper functions (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);
      const privateKey = await getPrivateKey(options.privateKey);

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
          message: 'Enter amount to transfer:',
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

      // Start spinner after all prompts are complete
      const spinner = ora('🔧 Initializing Thirdweb SDK...').start();

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

      spinner.text = '🔍 Getting token contract...';

      // Get the token contract
      const contract = await sdk.getContract(tokenAddress);

      spinner.text = '📄 Getting token details...';

      // Get token details
      const [name, symbol, decimals] = await Promise.all([
        contract.erc20.get(),
        contract.erc20.get(),
        contract.erc20.get()
      ]);

      spinner.text = '🔄 Transferring tokens...';

      // Transfer tokens
      const tx = await contract.erc20.transfer(recipientAddress, amount);

      spinner.succeed(chalk.green('✅ Tokens transferred successfully!'));
      console.log(chalk.blue('🔑 Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('👤 From:'), await sdk.wallet.getAddress());
      console.log(chalk.blue('👤 To:'), recipientAddress);
      console.log(chalk.blue('💰 Amount:'), amount, symbol);
      console.log(chalk.blue('📄 Token:'), name);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get the explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('🔗 View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to transfer tokens'));
      
      if (error.message?.includes('timeout')) {
        console.log(chalk.yellow('\n⚠️ The request timed out. This could be due to:'));
        console.log(chalk.yellow('1. Network connectivity issues'));
        console.log(chalk.yellow('2. Thirdweb service being temporarily unavailable'));
        console.log(chalk.yellow('3. IPFS gateway being slow to respond'));
        console.log(chalk.yellow('\nPlease try again in a few minutes.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 