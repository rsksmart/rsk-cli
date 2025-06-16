import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';

export const ipfsStorage = new Command()
  .name('ipfs')
  .description('IPFS storage operations using Thirdweb')
  .option('-u, --upload <path>', 'Upload file to IPFS')
  .option('-d, --download <hash>', 'Download file from IPFS')
  .action(async (options) => {
    const spinner = ora('Processing IPFS operation...').start();

    try {
      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        process.env.PRIVATE_KEY || '', // We'll need to get this from the wallet
        'rootstock'
      );

      if (options.upload) {
        // Upload file to IPFS
        const filePath = options.upload;
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = await fs.readFile(filePath);
        const upload = await sdk.storage.upload(fileContent);

        spinner.succeed(chalk.green('File uploaded to IPFS successfully!'));
        console.log(chalk.blue('IPFS Hash:'), upload);
        console.log(chalk.blue('IPFS URL:'), `ipfs://${upload}`);

      } else if (options.download) {
        // Download file from IPFS
        const hash = options.download;
        const fileContent = await sdk.storage.download(hash);
        const buffer = await fileContent.arrayBuffer();
        
        const outputPath = `ipfs-download-${Date.now()}`;
        await fs.writeFile(outputPath, new Uint8Array(buffer));

        spinner.succeed(chalk.green('File downloaded from IPFS successfully!'));
        console.log(chalk.blue('Saved to:'), outputPath);

      } else {
        // Interactive mode
        const { operation } = await inquirer.prompt([
          {
            type: 'list',
            name: 'operation',
            message: 'Select IPFS operation:',
            choices: ['Upload', 'Download']
          }
        ]);

        if (operation === 'Upload') {
          const { filePath } = await inquirer.prompt([
            {
              type: 'input',
              name: 'filePath',
              message: 'Enter file path to upload:'
            }
          ]);

          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }

          const fileContent = await fs.readFile(filePath);
          const upload = await sdk.storage.upload(fileContent);

          spinner.succeed(chalk.green('File uploaded to IPFS successfully!'));
          console.log(chalk.blue('IPFS Hash:'), upload);
          console.log(chalk.blue('IPFS URL:'), `ipfs://${upload}`);

        } else {
          const { hash } = await inquirer.prompt([
            {
              type: 'input',
              name: 'hash',
              message: 'Enter IPFS hash to download:'
            }
          ]);

          const fileContent = await sdk.storage.download(hash);
          const buffer = await fileContent.arrayBuffer();
          const outputPath = `ipfs-download-${Date.now()}`;
          await fs.writeFile(outputPath, new Uint8Array(buffer));

          spinner.succeed(chalk.green('File downloaded from IPFS successfully!'));
          console.log(chalk.blue('Saved to:'), outputPath);
        }
      }

    } catch (error) {
      spinner.fail(chalk.red('IPFS operation failed'));
      console.error(error);
    }
  }); 