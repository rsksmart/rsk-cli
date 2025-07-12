import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const checkBalance = new Command()
  .name('balance')
  .description('Check ERC20 token balance of an address')
  .option('-c, --address <address>', 'Token contract address')
  .option('-w, --wallet <address>', 'Wallet address to check balance for')
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
          name: 'wallet',
          message: 'Enter wallet address to check balance for:',
          when: !options.wallet,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Wallet address is required';
            }
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Wallet address must be a valid Ethereum address';
            }
            return true;
          }
        }
      ]);

      const tokenAddress = options.address || answers.address;
      const walletAddress = options.wallet || answers.wallet;

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

      spinner.text = '💰 Fetching token information...';

      // Get token information
      const balance = await contract.erc20.balanceOf(walletAddress);

      spinner.succeed(chalk.green('✅ Balance retrieved successfully!'));
      console.log(chalk.blue('📍 Token Address:'), tokenAddress);
      console.log(chalk.blue('👤 Wallet Address:'), walletAddress);
      console.log(chalk.blue('💰 Balance:'), balance.displayValue);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to check balance'));
      
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