import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const deployERC721 = new Command()
  .name('erc721')
  .description('Deploy an ERC721 NFT collection using Thirdweb')
  .option('-n, --name <name>', 'Collection name')
  .option('-s, --symbol <symbol>', 'Collection symbol')
  .option('-d, --description <description>', 'Collection description')
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
          name: 'name',
          message: 'Enter collection name:',
          when: !options.name,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Collection name is required';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'symbol',
          message: 'Enter collection symbol:',
          when: !options.symbol,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Collection symbol is required';
            }
            if (input.length > 10) {
              return 'Collection symbol should be 10 characters or less';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter collection description:',
          when: !options.description,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Collection description is required';
            }
            return true;
          }
        }
      ]);

      const collectionName = options.name || answers.name;
      const collectionSymbol = options.symbol || answers.symbol;
      const description = options.description || answers.description;

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

      spinner.text = '⏳ Deploying ERC721 collection...';

      // Deploy ERC721 collection
      const collectionAddress = await sdk.deployer.deployNFTCollection({
        name: collectionName,
        symbol: collectionSymbol,
        description: description
      });

      spinner.succeed(chalk.green('✅ ERC721 collection deployed successfully!'));
      console.log(chalk.blue('📍 Collection Address:'), collectionAddress);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to deploy ERC721 collection'));
      
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