import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const deployERC20 = new Command()
  .name('erc20')
  .description('Deploy an ERC20 token using Thirdweb')
  .option('-n, --name <name>', 'Token name')
  .option('-s, --symbol <symbol>', 'Token symbol')
  .option('-t, --testnet', 'Deploy on testnet')
  .action(async (options) => {
    const spinner = ora('Deploying ERC20 token...').start();

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
          name: 'name',
          message: 'Enter token name:',
          when: !options.name
        },
        {
          type: 'input',
          name: 'symbol',
          message: 'Enter token symbol:',
          when: !options.symbol
        }
      ]);

      const tokenName = options.name || answers.name;
      const tokenSymbol = options.symbol || answers.symbol;

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

      spinner.text = 'Deploying ERC20 token...';

      // Deploy ERC20 token
      const tokenAddress = await sdk.deployer.deployToken({
        name: tokenName,
        symbol: tokenSymbol
      });

      spinner.succeed(chalk.green('ERC20 token deployed successfully!'));
      console.log(chalk.blue('Token Address:'), tokenAddress);
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
      console.log(chalk.yellow('Note: Mint tokens to this contract after deployment as needed.'));

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to deploy ERC20 token'));
      
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