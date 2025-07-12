import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const transferNFT = new Command()
  .name('transfer-nft')
  .description('Transfer an NFT to another address')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-i, --token-id <id>', 'Token ID to transfer')
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
          message: 'Enter NFT contract address:',
          when: !options.address,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'NFT contract address is required';
            }
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'NFT contract address must be a valid Ethereum address';
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
          name: 'tokenId',
          message: 'Enter token ID to transfer:',
          when: !options.tokenId,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Token ID is required';
            }
            const num = Number(input);
            if (isNaN(num) || num < 0) {
              return 'Token ID must be a non-negative number';
            }
            return true;
          }
        }
      ]);

      const nftAddress = options.address || answers.address;
      const recipientAddress = options.to || answers.to;
      const tokenId = options.tokenId || answers.tokenId;

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

      spinner.text = '🔍 Getting NFT contract...';

      // Get the NFT contract
      const contract = await sdk.getContract(nftAddress);

      spinner.text = '🔄 Transferring NFT...';

      // Transfer NFT
      const tx = await contract.erc721.transfer(recipientAddress, tokenId);

      spinner.succeed(chalk.green('✅ NFT transferred successfully!'));
      console.log(chalk.blue('🔑 Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('👤 From:'), await sdk.wallet.getAddress());
      console.log(chalk.blue('👤 To:'), recipientAddress);
      console.log(chalk.blue('🆔 Token ID:'), tokenId);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get the explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('🔗 View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to transfer NFT'));
      
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