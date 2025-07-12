import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const deployCustomContract = new Command()
  .name('deploy-custom')
  .description('Deploy arbitrary contracts using Thirdweb')
  .option('-a, --abi <path>', 'Path to ABI file')
  .option('-b, --bytecode <path>', 'Path to bytecode file')
  .option('-c, --constructor-args <args...>', 'Constructor arguments')
  .option('-t, --testnet', 'Deploy on testnet')
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
          name: 'abiPath',
          message: '📄 Enter path to ABI file:',
          when: !options.abi,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'ABI file path is required';
            }
            if (!fs.existsSync(input)) {
              return 'ABI file not found';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'bytecodePath',
          message: '📄 Enter path to bytecode file:',
          when: !options.bytecode,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Bytecode file path is required';
            }
            if (!fs.existsSync(input)) {
              return 'Bytecode file not found';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'constructorArgs',
          message: '🔧 Enter constructor arguments (comma-separated):',
          when: !options.constructorArgs || options.constructorArgs.length === 0,
          filter: (input) => {
            if (!input || input.trim() === '') return [];
            return input.split(',').map((arg: string) => arg.trim());
          }
        }
      ]);

      const abiPath = options.abi || answers.abiPath;
      const bytecodePath = options.bytecode || answers.bytecodePath;
      const constructorArgs = options.constructorArgs || answers.constructorArgs || [];

      // Start spinner after all prompts are complete
      const spinner = ora('📄 Reading ABI file...').start();

      // Read and parse ABI
      const abiContent = fs.readFileSync(abiPath, 'utf8');
      const abi = JSON.parse(abiContent);

      if (!Array.isArray(abi)) {
        spinner.fail(chalk.red('❌ Invalid ABI file. Must be a JSON array.'));
        return;
      }

      spinner.text = '📄 Reading bytecode file...';

      // Read bytecode
      let bytecode = fs.readFileSync(bytecodePath, 'utf8').trim();
      if (!bytecode.startsWith('0x')) {
        bytecode = `0x${bytecode}`;
      }

      if (!bytecode) {
        spinner.fail(chalk.red('❌ Invalid bytecode file.'));
        return;
      }

      spinner.text = '🔧 Initializing Thirdweb SDK...';

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
      spinner.text = '💰 Checking wallet balance...';
      
      try {
        const balance = await sdk.wallet.balance();
        console.log(chalk.blue('🔑 Wallet Address:'), walletAddress);
        console.log(chalk.blue('💰 Wallet Balance:'), balance.displayValue, 'RBTC');
        console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
        
        if (balance.value.isZero()) {
          spinner.fail(chalk.red('❌ Wallet has no RBTC balance. Please fund your wallet first.'));
          return;
        }
      } catch (balanceError) {
        console.log(chalk.yellow('⚠️ Could not check balance, proceeding with deployment...'));
        console.log(chalk.blue('🔑 Wallet Address:'), walletAddress);
        console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
      }

      spinner.text = '⏳ Deploying contract...';

      // Deploy custom contract
      const contractAddress = await sdk.deployer.deployContractWithAbi(
        abi,
        bytecode,
        constructorArgs
      );

      spinner.succeed(chalk.green('✅ Contract deployed successfully!'));
      console.log(chalk.blue('📍 Contract Address:'), contractAddress);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/address/${contractAddress}`
        : `https://explorer.rootstock.io/address/${contractAddress}`;
      console.log(chalk.blue('🔗 View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to deploy contract'));
      
      if (error.message?.includes('sender account doesn\'t exist')) {
        console.log(chalk.yellow('\n⚠️ The sender account doesn\'t exist on this network. This could be due to:'));
        console.log(chalk.yellow('1. The account has never been used on this network'));
        console.log(chalk.yellow('2. The account has no RBTC balance'));
        console.log(chalk.yellow('3. You\'re using the wrong network (mainnet vs testnet)'));
        console.log(chalk.yellow('\nPlease ensure your wallet has some RBTC on the correct network.'));
      } else if (error.message?.includes('timeout')) {
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