import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

export const checkNFTBalance = new Command()
  .name('nft-balance')
  .description('Check ERC721 token balance of an address')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-w, --wallet <address>', 'Wallet address to check balance for')
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
          name: 'wallet',
          message: 'Enter wallet address to check balance for:',
          when: !options.wallet,
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Wallet address is required';
            }
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Wallet address must be a valid Ethereum address';
            }
            return true;
          }
        }
      ]);

      const nftAddress = options.address || answers.address;
      const walletAddress = options.wallet || answers.wallet;

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

      spinner.text = '💰 Fetching NFT information...';

      // Get NFT information
      const balance = await contract.erc721.balanceOf(walletAddress);
      const metadata = await contract.metadata.get();
      const nfts = await contract.erc721.getOwned(walletAddress);

      spinner.succeed(chalk.green('✅ NFT balance retrieved successfully!'));
      console.log(chalk.blue('📄 Collection Name:'), metadata.name);
      console.log(chalk.blue('📄 Collection Symbol:'), metadata.symbol);
      console.log(chalk.blue('📍 Contract Address:'), nftAddress);
      console.log(chalk.blue('👤 Wallet Address:'), walletAddress);
      console.log(chalk.blue('💰 Total NFTs Owned:'), balance.toString());
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      if (nfts.length > 0) {
        console.log(chalk.blue('\n📄 Owned NFTs:'));
        nfts.forEach((nft, index) => {
          console.log(chalk.green(`\n🖼️ NFT #${index + 1}:`));
          console.log(chalk.white(`  🆔 Token ID: ${nft.metadata.id}`));
          console.log(chalk.white(`  📄 Name: ${nft.metadata.name || 'Unnamed'}`));
          if (nft.metadata.description) {
            console.log(chalk.white(`  📝 Description: ${nft.metadata.description}`));
          }
          if (nft.metadata.image) {
            console.log(chalk.white(`  🖼️ Image: ${nft.metadata.image}`));
          }
        });
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to check NFT balance'));
      
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