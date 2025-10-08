import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKeyFromStoredWallet, getWalletAddressFromStoredWallet, removeThirdwebApiKey } from '../../utils/thirdwebHelper.js';

export const mintNFT = new Command()
  .name('mint-nft')
  .description('Mint an NFT to a specified address')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-t, --to <address>', 'Recipient address')
  .option('-n, --name <name>', 'NFT name')
  .option('-d, --description <description>', 'NFT description')
  .option('-i, --image <url>', 'NFT image URL')
  .option('--testnet', 'Use testnet')
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
      const toAddress = options.to || answers.to;
      const nftName = options.name || answers.name;
      const nftDescription = options.description || answers.description;
      const nftImage = options.image || answers.image;

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

      spinner.text = '🔍 Getting NFT contract...';

      // Get the NFT contract
      const contract = await sdk.getContract(nftAddress);

      spinner.text = '⏳ Minting NFT...';

      // Mint NFT
      const tx = await contract.erc721.mintTo(toAddress, {
        name: nftName,
        description: nftDescription,
        image: nftImage
      });

      spinner.succeed(chalk.green('✅ NFT minted successfully!'));
      console.log(chalk.blue('📍 NFT Contract Address:'), nftAddress);
      console.log(chalk.blue('👤 Minted To:'), toAddress);
      console.log(chalk.blue('📄 NFT Name:'), nftName);
      console.log(chalk.blue('📝 Description:'), nftDescription);
      console.log(chalk.blue('🖼️ Image URL:'), nftImage);
      console.log(chalk.blue('🔗 Transaction Hash:'), tx.receipt.transactionHash);
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

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
      } else if (error.message?.includes('Contract not found')) {
        console.log(chalk.yellow('\n⚠️ The specified NFT contract address was not found on this network.'));
        console.log(chalk.yellow('Please verify the contract address and network selection.'));
      } else if (error.message?.includes('insufficient funds')) {
        console.log(chalk.yellow('\n⚠️ Insufficient funds for gas fees.'));
        console.log(chalk.yellow('Please ensure your wallet has enough RBTC for transaction fees.'));
      } else if (error.message?.includes('not authorized')) {
        console.log(chalk.yellow('\n⚠️ You are not authorized to mint NFTs from this contract.'));
        console.log(chalk.yellow('Only the contract owner or authorized minter can mint NFTs.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 