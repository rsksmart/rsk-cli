import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { getThirdwebApiKey, getPrivateKeyFromStoredWallet, getWalletAddressFromStoredWallet, removeThirdwebApiKey } from '../../utils/thirdwebHelper.js';

interface IpfsAnswers {
  upload?: string;
  download?: string;
  output?: string;
}

export const ipfsCommand = new Command()
  .name('ipfs')
  .description('Upload and download files to/from IPFS using Thirdweb storage')
  .option('-u, --upload <path>', 'Path to file to upload')
  .option('-d, --download <hash>', 'IPFS hash to download')
  .option('-o, --output <path>', 'Output path for downloaded file')
  .option('-t, --testnet', 'Use testnet')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--wallet <name>', 'Wallet name to use (optional, uses current wallet if not specified)')
  .action(async (options) => {
    try {
      // Get API key using helper function (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);

      // Determine operation type
      const isUpload = options.upload || (!options.download && !options.upload);
      const isDownload = options.download;

      if (isUpload && isDownload) {
        console.log(chalk.red('❌ Cannot upload and download at the same time. Please specify either --upload or --download.'));
        return;
      }

      if (!isUpload && !isDownload) {
        console.log(chalk.red('❌ Please specify either --upload or --download option.'));
        return;
      }

      // Get missing options through prompts if not provided
      let answers: IpfsAnswers = {};
      if (isUpload) {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'upload',
            message: 'Enter path to file to upload:',
            when: !options.upload,
            validate: (input) => {
              if (!input || input.trim() === '') {
                return 'File path is required';
              }
              if (!fs.existsSync(input)) {
                return 'File does not exist';
              }
              if (!fs.statSync(input).isFile()) {
                return 'Path must be a file';
              }
              return true;
            }
          }
        ]);
      } else if (isDownload) {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'download',
            message: 'Enter IPFS hash to download:',
            when: !options.download,
            validate: (input) => {
              if (!input || input.trim() === '') {
                return 'IPFS hash is required';
              }
              return true;
            }
          },
          {
            type: 'input',
            name: 'output',
            message: 'Enter output path for downloaded file:',
            when: !options.output,
            validate: (input) => {
              if (!input || input.trim() === '') {
                return 'Output path is required';
              }
              const dir = path.dirname(input);
              if (dir !== '.' && !fs.existsSync(dir)) {
                return 'Output directory does not exist';
              }
              return true;
            }
          }
        ]);
      }

      const uploadPath = options.upload || answers.upload;
      const downloadHash = options.download || answers.download;
      const outputPath = options.output || answers.output;

      // Get private key from stored wallet (prompt first, no spinner)
      const privateKey = await getPrivateKeyFromStoredWallet(options.wallet);
      
      // Derive wallet address from private key
      const { privateKeyToAccount } = await import('viem/accounts');
      const prefixedPrivateKey = `0x${privateKey}` as `0x${string}`;
      const account = privateKeyToAccount(prefixedPrivateKey);
      const walletAddress = account.address;

      // Start spinner after private key is obtained
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

      if (isUpload && uploadPath) {
        spinner.text = '📤 Uploading file to IPFS...';

        // Upload file to IPFS
        const fileBuffer = fs.readFileSync(uploadPath);
        const fileName = path.basename(uploadPath);
        const file = new File([new Uint8Array(fileBuffer)], fileName, { type: 'application/octet-stream' });

        const upload = await sdk.storage.upload(file);
        const ipfsHash = upload.split('ipfs://')[1];

        spinner.succeed(chalk.green('✅ File uploaded successfully!'));
        console.log(chalk.blue('📄 File Name:'), fileName);
        console.log(chalk.blue('📁 File Path:'), uploadPath);
        console.log(chalk.blue('🔗 IPFS Hash:'), ipfsHash);
        console.log(chalk.blue('🔗 IPFS URL:'), upload);
        console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');

      } else if (isDownload && downloadHash && outputPath) {
        spinner.text = '📥 Downloading file from IPFS...';

        // Download file from IPFS
        const ipfsUrl = `ipfs://${downloadHash}`;
        const fileBuffer = await sdk.storage.download(ipfsUrl);
        const arrayBuffer = await fileBuffer.arrayBuffer();

        // Write file to output path
        fs.writeFileSync(outputPath, new Uint8Array(arrayBuffer));

        spinner.succeed(chalk.green('✅ File downloaded successfully!'));
        console.log(chalk.blue('🔗 IPFS Hash:'), downloadHash);
        console.log(chalk.blue('📁 Output Path:'), outputPath);
        console.log(chalk.blue('📊 File Size:'), `${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
        console.log(chalk.blue('🌐 Network:'), options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet');
      }

    } catch (error: any) {
      console.error(chalk.red('❌ IPFS operation failed'));
      
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
      } else if (error.message?.includes('File not found')) {
        console.log(chalk.yellow('\n⚠️ The specified IPFS hash was not found.'));
        console.log(chalk.yellow('Please verify the IPFS hash is correct.'));
      } else if (error.message?.includes('Invalid IPFS hash')) {
        console.log(chalk.yellow('\n⚠️ The provided IPFS hash is invalid.'));
        console.log(chalk.yellow('Please provide a valid IPFS hash.'));
      } else if (error.message?.includes('File too large')) {
        console.log(chalk.yellow('\n⚠️ The file is too large to upload.'));
        console.log(chalk.yellow('Please try with a smaller file.'));
      } else {
        console.error(chalk.red('❌ Error details:'), error.message || error);
      }
    }
  }); 