import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const checkNFTBalance = new Command()
  .name('nft-balance')
  .description('Check ERC721 token balance of an address')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-w, --wallet <address>', 'Wallet address to check balance for')
  .option('--testnet', 'Use testnet')
  .action(async (options) => {
    const spinner = ora('Checking NFT balance...').start();

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
          name: 'wallet',
          message: 'Enter wallet address to check balance for:',
          when: !options.wallet,
          validate: (input) => input.startsWith('0x') && input.length === 42
        }
      ]);

      const nftAddress = options.address || answers.address;
      const walletAddress = options.wallet || answers.wallet;

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

      spinner.text = 'Fetching NFT information...';

      // Get NFT information
      const balance = await contract.erc721.balanceOf(walletAddress);
      const metadata = await contract.metadata.get();
      const nfts = await contract.erc721.getOwned(walletAddress);

      spinner.succeed(chalk.green('NFT balance retrieved successfully!'));
      console.log(chalk.blue('Collection Name:'), metadata.name);
      console.log(chalk.blue('Collection Symbol:'), metadata.symbol);
      console.log(chalk.blue('Contract Address:'), nftAddress);
      console.log(chalk.blue('Wallet Address:'), walletAddress);
      console.log(chalk.blue('Total NFTs Owned:'), balance.toString());
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      if (nfts.length > 0) {
        console.log(chalk.blue('\nOwned NFTs:'));
        nfts.forEach((nft, index) => {
          console.log(chalk.green(`\nNFT #${index + 1}:`));
          console.log(chalk.white(`  Token ID: ${nft.metadata.id}`));
          console.log(chalk.white(`  Name: ${nft.metadata.name || 'Unnamed'}`));
          if (nft.metadata.description) {
            console.log(chalk.white(`  Description: ${nft.metadata.description}`));
          }
          if (nft.metadata.image) {
            console.log(chalk.white(`  Image: ${nft.metadata.image}`));
          }
        });
      }

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to check NFT balance'));
      
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