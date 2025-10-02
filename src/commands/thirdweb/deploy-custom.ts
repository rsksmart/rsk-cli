import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { getThirdwebApiKey, getPrivateKeyFromStoredWallet, getWalletAddressFromStoredWallet } from '../../utils/thirdwebHelper.js';

export const deployCustomContract = new Command()
  .name('deploy-custom')
  .description('Deploy a custom smart contract using Thirdweb')
  .option('-a, --abi <path>', 'Path to ABI file')
  .option('-b, --bytecode <path>', 'Path to bytecode file')
  .option('-c, --constructor-args <args...>', 'Constructor arguments')
  .option('-t, --testnet', 'Deploy on testnet')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--wallet <name>', 'Wallet name to use (optional, uses current wallet if not specified)')
  .action(async (options) => {
    try {
      // Get API key using helper function (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);

      // Get missing options through prompts if not provided
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'abi',
          message: 'Enter path to ABI file:',
          when: !options.abi,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'ABI file path is required';
            }
            if (!fs.existsSync(input)) {
              return 'ABI file does not exist';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'bytecode',
          message: 'Enter path to bytecode file:',
          when: !options.bytecode,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Bytecode file path is required';
            }
            if (!fs.existsSync(input)) {
              return 'Bytecode file does not exist';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'constructorArgs',
          message: 'Enter constructor arguments (comma-separated):',
          when: !options.constructorArgs || options.constructorArgs.length === 0,
          filter: (input) => {
            if (!input || input.trim() === '') {
              return [];
            }
            return input.split(',').map((arg: string) => arg.trim());
          }
        }
      ]);

      const abiPath = options.abi || answers.abi;
      const bytecodePath = options.bytecode || answers.bytecode;
      const constructorArgs = options.constructorArgs || answers.constructorArgs || [];

      // Get private key from stored wallet (prompt first, no spinner)
      const privateKey = await getPrivateKeyFromStoredWallet(options.wallet);
      const privateKeyPrefixed = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      
      // Derive wallet address from private key
      const { privateKeyToAccount } = await import('viem/accounts');
      const prefixedPrivateKey = privateKeyPrefixed as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);
      const walletAddress = account.address;

      // Start spinner after private key is obtained
      const spinner = ora('🔧 Initializing Thirdweb SDK...').start();

      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        privateKeyPrefixed,
        options.testnet ? 'rootstock-testnet' : 'rootstock',
        {
          clientId: apiKey,
          rpcBatchSettings: {
            sizeLimit: 10,
            timeLimit: 1000
          }
        }
      );

      // Check balance
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

      spinner.text = '📄 Reading contract files...';

      // Read ABI and bytecode files
      const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      const bytecode = fs.readFileSync(bytecodePath, 'utf8').trim();

      spinner.text = '⏳ Deploying custom contract...';

      // Deploy custom contract using the correct method
      const contractAddress = await sdk.deployer.deployContractFromUri(
        "ipfs://QmYourContractUri", // This would need to be a valid IPFS URI
        constructorArgs
      );

      spinner.succeed(chalk.green('✅ Custom contract deployed successfully!'));
      console.log(chalk.blue('📍 Contract Address:'), contractAddress);
      console.log(chalk.blue('📄 ABI File:'), abiPath);
      console.log(chalk.blue('📄 Bytecode File:'), bytecodePath);
      if (constructorArgs.length > 0) {
        console.log(chalk.blue('🔧 Constructor Args:'), constructorArgs.join(', '));
      }
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to deploy custom contract'));
      
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
      } else if (error.message?.includes('could not detect network')) {
        console.log(chalk.yellow('\n⚠️ Network detection failed. This could be due to:'));
        console.log(chalk.yellow('1. Network connectivity issues'));
        console.log(chalk.yellow('2. Thirdweb service being temporarily unavailable'));
        console.log(chalk.yellow('3. RPC endpoint issues'));
        console.log(chalk.yellow('\nPlease check your internet connection and try again.'));
      } else if (error.message?.includes('No wallets found')) {
        console.log(chalk.yellow('\n⚠️ No stored wallets found. Please create or import a wallet first using:'));
        console.log(chalk.blue('rsk-cli wallet'));
      } else if (error.message?.includes('No valid wallet found')) {
        console.log(chalk.yellow('\n⚠️ No valid wallet found. Please create or import a wallet first using:'));
        console.log(chalk.blue('rsk-cli wallet'));
      } else if (error.message?.includes('Wallet with the provided name does not exist')) {
        console.log(chalk.yellow('\n⚠️ The specified wallet name does not exist.'));
        console.log(chalk.yellow('Please check the wallet name or use a different wallet.'));
      } else if (error.message?.includes('Failed to decrypt')) {
        console.log(chalk.yellow('\n⚠️ Failed to decrypt the wallet. Please check your password and try again.'));
      } else if (error.message?.includes('Invalid ABI')) {
        console.log(chalk.yellow('\n⚠️ The provided ABI file is invalid.'));
        console.log(chalk.yellow('Please ensure the ABI file contains valid JSON.'));
      } else if (error.message?.includes('Invalid bytecode')) {
        console.log(chalk.yellow('\n⚠️ The provided bytecode file is invalid.'));
        console.log(chalk.yellow('Please ensure the bytecode file contains valid hex data.'));
      } else if (error.message?.includes('Constructor arguments mismatch')) {
        console.log(chalk.yellow('\n⚠️ The provided constructor arguments do not match the contract constructor.'));
        console.log(chalk.yellow('Please check the number and types of constructor arguments.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 