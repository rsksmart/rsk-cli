import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getThirdwebApiKey, getWalletAddressFromPrompt } from '../../utils/thirdwebHelper.js';

export const checkNFTBalance = new Command()
  .name('nft-balance')
  .description('Check NFT balance of an address')
  .option('-c, --address <address>', 'NFT contract address')
  .option('-w, --wallet <name>', 'Wallet name to use (optional, uses current wallet if not specified)')
  .option('-t, --testnet', 'Use testnet')
  .option('--api-key <key>', 'Thirdweb API key')
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
        }
      ]);

      const nftAddress = options.address || answers.address;

      // Get wallet address from prompt (no private key needed for read operations)
      const walletAddress = await getWalletAddressFromPrompt();

      // Start spinner after wallet address is obtained
      const spinner = ora('🔧 Initializing Thirdweb SDK...').start();

      // Initialize Thirdweb SDK with public client (no private key needed)
      const sdk = ThirdwebSDK.fromPrivateKey(
        "1111111111111111111111111111111111111111111111111111111111111111", // Dummy private key for read-only
        options.testnet ? 'rootstock-testnet' : 'rootstock',
        {
          clientId: apiKey
        }
      );

      spinner.text = '🔍 Getting NFT contract...';

      // Get the NFT contract
      const contract = await sdk.getContract(nftAddress);

      spinner.text = '💰 Fetching NFT information...';

      // Get NFT information
      const balance = await contract.erc721.balanceOf(walletAddress);
      const ownedTokens = await contract.erc721.getOwned(walletAddress);

      spinner.succeed(chalk.green('✅ NFT balance retrieved successfully!'));
      console.log(chalk.blue('📍 NFT Contract Address:'), nftAddress);
      console.log(chalk.blue('👤 Wallet Address:'), walletAddress);
      console.log(chalk.blue('💰 NFT Balance:'), balance.toString());
      console.log(chalk.blue('🖼️ Owned NFTs:'), ownedTokens.length);
      
      if (ownedTokens.length > 0) {
        console.log(chalk.blue('📋 Token IDs:'), ownedTokens.map(token => token.metadata?.name || token.metadata?.id || token.metadata?.tokenId || 'Unknown').join(', '));
      }
      
      console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to check NFT balance'));
      
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
        console.log(chalk.yellow('\n⚠️ The specified NFT contract address was not found on this network.'));
        console.log(chalk.yellow('Please verify the contract address and network selection.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 