import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const mintNFT = new Command()
  .name('mint-nft')
  .description('Mint an NFT to an ERC721 collection')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-n, --name <name>', 'NFT name')
  .option('-d, --description <description>', 'NFT description')
  .option('-i, --image <url>', 'NFT image URL')
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
          name: 'name',
          message: 'Enter NFT name:',
          when: !options.name,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'NFT name is required';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter NFT description:',
          when: !options.description,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'NFT description is required';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'image',
          message: 'Enter NFT image URL:',
          when: !options.image,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'NFT image URL is required';
            }
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          }
        }
      ]);

      const nftAddress = options.address || answers.address;
      const recipientAddress = options.to || answers.to;
      const nftName = options.name || answers.name;
      const nftDescription = options.description || answers.description;
      const nftImage = options.image || answers.image;

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

      spinner.text = '📄 Preparing NFT metadata...';

      // Create NFT metadata
      const metadata = {
        name: nftName,
        description: nftDescription,
        image: nftImage
      };

      spinner.text = '⏳ Minting NFT...';

      // Mint NFT
      const tx = await contract.erc721.mintTo(recipientAddress, metadata);

      spinner.succeed(chalk.green('✅ NFT minted successfully!'));
      console.log(chalk.blue('🔑 Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('👤 Recipient:'), recipientAddress);
      console.log(chalk.blue('📄 NFT Name:'), nftName);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get the explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('🔗 View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to mint NFT'));
      
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