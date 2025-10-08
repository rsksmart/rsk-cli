import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKeyFromStoredWallet, getWalletAddressFromStoredWallet, removeThirdwebApiKey } from '../../utils/thirdwebHelper.js';

export const deployERC721 = new Command()
  .name('erc721')
  .description('Deploy an ERC721 NFT collection using Thirdweb')
  .option('-n, --name <name>', 'Collection name')
  .option('-s, --symbol <symbol>', 'Collection symbol')
  .option('-d, --description <description>', 'Collection description')
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
      const collectionDescription = options.description || answers.description;

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

      spinner.text = '⏳ Deploying ERC721 collection...';

      // Deploy ERC721 collection
      const contractAddress = await sdk.deployer.deployNFTCollection({
        name: collectionName,
        symbol: collectionSymbol,
        description: collectionDescription
      });

      spinner.succeed(chalk.green('✅ ERC721 collection deployed successfully!'));
      console.log(chalk.blue('📍 Contract Address:'), contractAddress);
      console.log(chalk.blue('📄 Collection Name:'), collectionName);
      console.log(chalk.blue('🔤 Collection Symbol:'), collectionSymbol);
      console.log(chalk.blue('📝 Description:'), collectionDescription);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
      console.log(chalk.yellow('📝 Note: You can now mint NFTs to this collection using the mint-nft command.'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to deploy ERC721 collection'));
      
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
        // Check if API key was from storage (not passed as option)
        if (!options.apiKey) {
          console.log(chalk.red('\n❌ Invalid Thirdweb API key.'));
          console.log(chalk.yellow('The stored API key appears to be incorrect.'));
          await removeThirdwebApiKey();
          console.log(chalk.blue('\nPlease run the command again to enter a valid API key.'));
          return;
        } else {
          console.log(chalk.yellow('\n⚠️ Network detection failed. This could be due to:'));
          console.log(chalk.yellow('1. Network connectivity issues'));
          console.log(chalk.yellow('2. Thirdweb service being temporarily unavailable'));
          console.log(chalk.yellow('3. RPC endpoint issues'));
          console.log(chalk.yellow('\nPlease check your internet connection and try again.'));
        }
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
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 