import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const deployERC20 = new Command()
  .name('erc20')
  .description('Deploy an ERC20 token using Thirdweb')
  .option('-n, --name <name>', 'Token name')
  .option('-s, --symbol <symbol>', 'Token symbol')
  .option('-t, --testnet', 'Deploy on testnet')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--private-key <key>', 'Private key')
  .action(async (options) => {
    try {
      // Get API key and private key using helper functions (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);
      const privateKey = await getPrivateKey(options.privateKey);

      // Start spinner after credentials are obtained
      const spinner = ora('Preparing deployment...').start();

      // Get missing options through prompts if not provided
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter token name:',
          when: !options.name,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Token name is required';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'symbol',
          message: 'Enter token symbol:',
          when: !options.symbol,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Token symbol is required';
            }
            if (input.length > 10) {
              return 'Token symbol should be 10 characters or less';
            }
            return true;
          }
        }
      ]);

      const tokenName = options.name || answers.name;
      const tokenSymbol = options.symbol || answers.symbol;

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

      // Get wallet address and check balance
      const walletAddress = await sdk.wallet.getAddress();
      spinner.text = 'Checking wallet balance...';
      
      try {
        const balance = await sdk.wallet.balance();
        console.log(chalk.blue('Wallet Address:'), walletAddress);
        console.log(chalk.blue('Wallet Balance:'), balance.displayValue, 'RBTC');
        console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
        
        if (balance.value.isZero()) {
          spinner.fail(chalk.red('Wallet has no RBTC balance. Please fund your wallet first.'));
          return;
        }
      } catch (balanceError) {
        console.log(chalk.yellow('Could not check balance, proceeding with deployment...'));
        console.log(chalk.blue('Wallet Address:'), walletAddress);
        console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
      }

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
      console.error(chalk.red('Failed to deploy ERC20 token'));
      
      if (error.message?.includes('sender account doesn\'t exist')) {
        console.log(chalk.yellow('\nThe sender account doesn\'t exist on this network. This could be due to:'));
        console.log(chalk.yellow('1. The account has never been used on this network'));
        console.log(chalk.yellow('2. The account has no RBTC balance'));
        console.log(chalk.yellow('3. You\'re using the wrong network (mainnet vs testnet)'));
        console.log(chalk.yellow('\nPlease ensure your wallet has some RBTC on the correct network.'));
      } else if (error.message?.includes('timeout')) {
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