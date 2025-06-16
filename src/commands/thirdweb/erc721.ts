import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const deployERC721 = new Command()
  .name('erc721')
  .description('Deploy an ERC721 NFT collection using Thirdweb')
  .option('-n, --name <name>', 'Collection name')
  .option('-s, --symbol <symbol>', 'Collection symbol')
  .option('-d, --description <description>', 'Collection description')
  .option('-t, --testnet', 'Deploy on testnet')
  .action(async (options) => {
    const spinner = ora('Deploying ERC721 collection...').start();

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
          message: 'Enter collection name:',
          when: !options.name
        },
        {
          type: 'input',
          name: 'symbol',
          message: 'Enter collection symbol:',
          when: !options.symbol
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter collection description:',
          when: !options.description
        }
      ]);

      const collectionName = options.name || answers.name;
      const collectionSymbol = options.symbol || answers.symbol;
      const description = options.description || answers.description;

      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        process.env.PRIVATE_KEY,
        options.testnet ? 'rootstock-testnet' : 'rootstock',
        {
          clientId: process.env.THIRDWEB_CLIENT_ID
        }
      );

      // Deploy ERC721 collection
      const collectionAddress = await sdk.deployer.deployNFTCollection({
        name: collectionName,
        symbol: collectionSymbol,
        description: description
      });

      spinner.succeed(chalk.green('ERC721 collection deployed successfully!'));
      console.log(chalk.blue('Collection Address:'), collectionAddress);
      console.log(chalk.blue('Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error) {
      spinner.fail(chalk.red('Failed to deploy ERC721 collection'));
      console.error(error);
    }
  }); 