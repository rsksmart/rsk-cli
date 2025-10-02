import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKeyFromStoredWallet, getWalletAddressFromStoredWallet } from '../../utils/thirdwebHelper.js';

export const mintTokens = new Command()
  .name('mint')
  .description('Mint ERC20 tokens')
  .option('-c, --address <address>', 'Token contract address')
  .option('-r, --to <address>', 'Recipient address')
  .option('-a, --amount <amount>', 'Amount to mint')
  .option('-t, --testnet', 'Use testnet')
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
          message: 'Enter amount to mint:',
          when: !options.amount,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Amount is required';
            }
            const num = parseFloat(input);
            if (isNaN(num) || num <= 0) {
              return 'Amount must be a positive number';
            }
            return true;
          }
        }
      ]);

      const tokenAddress = options.address || answers.address;
      const toAddress = options.to || answers.to;
      const amount = parseFloat(options.amount || answers.amount);

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

      spinner.text = '🔍 Getting token contract...';

      // Get the token contract
      const contract = await sdk.getContract(tokenAddress);

      spinner.text = '⏳ Minting tokens...';

      // Mint tokens
      const tx = await contract.erc20.mintTo(toAddress, amount.toString());

      spinner.succeed(chalk.green('✅ Tokens minted successfully!'));
      console.log(chalk.blue('📍 Token Address:'), tokenAddress);
      console.log(chalk.blue('👤 Minted To:'), toAddress);
      console.log(chalk.blue('💸 Amount:'), amount);
      console.log(chalk.blue('🔗 Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('🔗 View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to mint tokens'));
      
      if (error.message?.includes('timeout')) {
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
      } else if (error.message?.includes('Contract not found')) {
        console.log(chalk.yellow('\n⚠️ The specified token contract address was not found on this network.'));
        console.log(chalk.yellow('Please verify the contract address and network selection.'));
      } else if (error.message?.includes('insufficient funds')) {
        console.log(chalk.yellow('\n⚠️ Insufficient funds for gas fees.'));
        console.log(chalk.yellow('Please ensure your wallet has enough RBTC for transaction fees.'));
      } else if (error.message?.includes('not authorized')) {
        console.log(chalk.yellow('\n⚠️ You are not authorized to mint tokens from this contract.'));
        console.log(chalk.yellow('Only the contract owner or authorized minter can mint tokens.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 