import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const mintNFT = new Command()
  .name('mint-nft')
  .description('Mint an NFT to an ERC721 collection')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-n, --name <name>', 'NFT name')
  .option('-d, --description <description>', 'NFT description')
  .option('-i, --image <url>', 'NFT image URL')
  .option('--testnet', 'Use testnet')
  .action(async (options) => {
    const spinner = ora('Minting NFT...').start();

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
          name: 'address',
          message: 'Enter NFT contract address:',
          when: !options.address,
          validate: (input) => input.startsWith('0x') && input.length === 42
        },
        {
          type: 'input',
          name: 'to',
          message: 'Enter recipient address:',
          when: !options.to,
          validate: (input) => input.startsWith('0x') && input.length === 42
        },
        {
          type: 'input',
          name: 'name',
          message: 'Enter NFT name:',
          when: !options.name
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter NFT description:',
          when: !options.description
        },
        {
          type: 'input',
          name: 'image',
          message: 'Enter NFT image URL:',
          when: !options.image
        }
      ]);

      const nftAddress = options.address || answers.address;
      const recipientAddress = options.to || answers.to;
      const nftName = options.name || answers.name;
      const nftDescription = options.description || answers.description;
      const nftImage = options.image || answers.image;

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

      spinner.text = 'Getting NFT contract...';

      // Get the NFT contract
      const contract = await sdk.getContract(nftAddress);

      spinner.text = 'Preparing NFT metadata...';

      // Create NFT metadata
      const metadata = {
        name: nftName,
        description: nftDescription,
        image: nftImage
      };

      spinner.text = 'Minting NFT...';

      // Mint NFT
      const tx = await contract.erc721.mintTo(recipientAddress, metadata);

      spinner.succeed(chalk.green('NFT minted successfully!'));
      console.log(chalk.blue('Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('Recipient:'), recipientAddress);
      console.log(chalk.blue('NFT Name:'), nftName);
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      // Get the explorer URL
      const explorerUrl = options.testnet
        ? `https://explorer.testnet.rootstock.io/tx/${tx.receipt.transactionHash}`
        : `https://explorer.rootstock.io/tx/${tx.receipt.transactionHash}`;
      console.log(chalk.blue('View on Explorer:'), chalk.dim(explorerUrl));

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to mint NFT'));
      
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