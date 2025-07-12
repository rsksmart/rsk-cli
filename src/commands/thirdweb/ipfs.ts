import { Command } from 'commander';
import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { getThirdwebApiKey, getPrivateKey } from '../../utils/thirdwebHelper.js';

// Function to detect file type from buffer and return appropriate extension
function detectFileExtension(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  
  // Check for HTML error pages first
  if (uint8Array.length >= 10) {
    const text = new TextDecoder().decode(uint8Array.slice(0, 100));
    if (text.toLowerCase().includes('<!doctype html>') || 
        text.toLowerCase().includes('<html') ||
        text.toLowerCase().includes('error') ||
        text.toLowerCase().includes('not found')) {
      return '.html';
    }
  }
  
  // Check for common file signatures
  if (uint8Array.length >= 2) {
    // JPEG
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      return '.jpg';
    }
    // PNG
    if (uint8Array.length >= 8 && 
        uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && 
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      return '.png';
    }
    // GIF
    if (uint8Array.length >= 6 && 
        uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && 
        uint8Array[2] === 0x46) {
      return '.gif';
    }
    // PDF
    if (uint8Array.length >= 4 && 
        uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && 
        uint8Array[2] === 0x44 && uint8Array[3] === 0x46) {
      return '.pdf';
    }
    // ZIP
    if (uint8Array.length >= 4 && 
        uint8Array[0] === 0x50 && uint8Array[1] === 0x4B && 
        uint8Array[2] === 0x03 && uint8Array[3] === 0x04) {
      return '.zip';
    }
    // MP4
    if (uint8Array.length >= 12 && 
        uint8Array[4] === 0x66 && uint8Array[5] === 0x74 && 
        uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
      return '.mp4';
    }
    // MP3
    if (uint8Array.length >= 3 && 
        uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && 
        uint8Array[2] === 0x33) {
      return '.mp3';
    }
    // WebP
    if (uint8Array.length >= 12 && 
        uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && 
        uint8Array[2] === 0x46 && uint8Array[8] === 0x57 && 
        uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && 
        uint8Array[11] === 0x50) {
      return '.webp';
    }
  }
  
  // Default to .bin if no known signature is found
  return '.bin';
}

export const ipfsStorage = new Command()
  .name('ipfs')
  .description('IPFS storage operations using Thirdweb')
  .option('-u, --upload <path>', 'Upload file to IPFS')
  .option('-d, --download <hash>', 'Download file from IPFS')
  .option('--api-key <key>', 'Thirdweb API key')
  .option('--private-key <key>', 'Private key')
  .action(async (options) => {
    try {
      // Get API key and private key using helper functions (no spinner during prompts)
      const apiKey = await getThirdwebApiKey(options.apiKey);
      const privateKey = await getPrivateKey(options.privateKey);

      // Start spinner after all prompts are complete
      const spinner = ora('🔧 Initializing Thirdweb SDK...').start();

      // Initialize Thirdweb SDK with Rootstock network
      const sdk = ThirdwebSDK.fromPrivateKey(
        privateKey,
        'rootstock',
        {
          clientId: apiKey,
          rpcBatchSettings: {
            sizeLimit: 10,
            timeLimit: 1000
          }
        }
      );

      if (options.upload) {
        // Upload file to IPFS
        spinner.text = '📤 Uploading file to IPFS...';
        const filePath = options.upload;
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = await fs.readFile(filePath);
        const upload = await sdk.storage.upload(fileContent);

        // Clean up the upload result - remove ipfs:// prefix if present
        let cleanHash = upload;
        if (cleanHash.startsWith('ipfs://')) {
          cleanHash = cleanHash.replace('ipfs://', '');
        }

        spinner.succeed(chalk.green('✅ File uploaded to IPFS successfully!'));
        console.log(chalk.blue('🔗 IPFS Hash:'), cleanHash);
        console.log(chalk.blue('🔗 IPFS URL:'), `ipfs://${cleanHash}`);
        console.log(chalk.blue('🌐 Gateway URL:'), `https://ipfs.io/ipfs/${cleanHash}`);

      } else if (options.download) {
        // Download file from IPFS
        spinner.text = '📥 Downloading file from IPFS...';
        let hash = options.download;
        
        // Clean up the hash - remove any ipfs:// prefix if present, but DO NOT strip /0 or path
        if (hash.startsWith('ipfs://')) {
          hash = hash.replace('ipfs://', '');
        }
        
        console.log(chalk.gray(`Attempting to download hash: ${hash}`));
        
        // Try multiple IPFS gateways with the full hash (including /0)
        const gateways = [
          `https://ipfs.io/ipfs/${hash}`,
          `https://gateway.pinata.cloud/ipfs/${hash}`,
          `https://cloudflare-ipfs.com/ipfs/${hash}`,
          `https://dweb.link/ipfs/${hash}`
        ];
        
        let downloaded = false;
        let arrayBuffer: ArrayBuffer | null = null;
        
        // First try Thirdweb SDK
        try {
          const ipfsUrl = `ipfs://${hash}`;
          console.log(chalk.gray(`Trying Thirdweb SDK with URL: ${ipfsUrl}`));
          
          const fileContent = await sdk.storage.download(ipfsUrl);
          arrayBuffer = await fileContent.arrayBuffer();
          downloaded = true;
          console.log(chalk.green('✓ Downloaded via Thirdweb SDK'));
          
        } catch (sdkError: any) {
          console.log(chalk.yellow('Thirdweb SDK download failed, trying public gateways...'));
          
          // Try public gateways
          for (const gateway of gateways) {
            try {
              console.log(chalk.gray(`Trying gateway: ${gateway}`));
              const response = await fetch(gateway);
              
              if (!response.ok) {
                console.log(chalk.red(`Gateway failed: ${response.status} ${response.statusText}`));
                continue;
              }
              
              arrayBuffer = await response.arrayBuffer();
              downloaded = true;
              console.log(chalk.green(`✓ Downloaded via ${gateway}`));
              break;
              
            } catch (gatewayError: any) {
              console.log(chalk.red(`Gateway error: ${gatewayError.message}`));
              continue;
            }
          }
        }
        
        if (!downloaded || !arrayBuffer) {
          throw new Error('Failed to download file from all available sources');
        }
        
        // Detect file type and get appropriate extension
        const extension = detectFileExtension(arrayBuffer);
        const outputPath = `ipfs-download-${Date.now()}${extension}`;
        await fs.writeFile(outputPath, new Uint8Array(arrayBuffer));

        spinner.succeed(chalk.green('✅ File downloaded from IPFS successfully!'));
        console.log(chalk.blue('💾 Saved to:'), outputPath);
        console.log(chalk.blue('📏 File size:'), `${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
        console.log(chalk.blue('📄 File type:'), extension.substring(1).toUpperCase());
        
        // If it's an HTML file, warn the user
        if (extension === '.html') {
          console.log(chalk.yellow('\n⚠️  Warning: Downloaded file appears to be an HTML error page.'));
          console.log(chalk.yellow('This might indicate that the IPFS hash is invalid or the file is not accessible.'));
          console.log(chalk.yellow('Please check the IPFS hash and try again.'));
        }

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
              message: 'Enter file path to upload:',
              validate: (input) => {
                if (!input || input.trim() === '') {
                  return 'File path is required';
                }
                if (!fs.existsSync(input)) {
                  return 'File not found. Please check the path.';
                }
                return true;
              }
            }
          ]);

          spinner.text = '📤 Uploading file to IPFS...';
          const fileContent = await fs.readFile(filePath);
          const upload = await sdk.storage.upload(fileContent);

          // Clean up the upload result - remove ipfs:// prefix if present
          let cleanHash = upload;
          if (cleanHash.startsWith('ipfs://')) {
            cleanHash = cleanHash.replace('ipfs://', '');
          }

          spinner.succeed(chalk.green('✅ File uploaded to IPFS successfully!'));
          console.log(chalk.blue('🔗 IPFS Hash:'), cleanHash);
          console.log(chalk.blue('🔗 IPFS URL:'), `ipfs://${cleanHash}`);
          console.log(chalk.blue('🌐 Gateway URL:'), `https://ipfs.io/ipfs/${cleanHash}`);

        } else {
          const { hash } = await inquirer.prompt([
            {
              type: 'input',
              name: 'hash',
              message: 'Enter IPFS hash to download:',
              validate: (input) => {
                if (!input || input.trim() === '') {
                  return 'IPFS hash is required';
                }
                return true;
              }
            }
          ]);

          spinner.text = '📥 Downloading file from IPFS...';
          
          // Clean up the hash - remove any ipfs:// prefix if present, but DO NOT strip /0 or path
          let cleanHash = hash;
          if (cleanHash.startsWith('ipfs://')) {
            cleanHash = cleanHash.replace('ipfs://', '');
          }
          
          console.log(chalk.gray(`Attempting to download hash: ${cleanHash}`));
          
          // Try multiple IPFS gateways with the full hash (including /0)
          const gateways = [
            `https://ipfs.io/ipfs/${cleanHash}`,
            `https://gateway.pinata.cloud/ipfs/${cleanHash}`,
            `https://cloudflare-ipfs.com/ipfs/${cleanHash}`,
            `https://dweb.link/ipfs/${cleanHash}`
          ];
          
          let downloaded = false;
          let arrayBuffer: ArrayBuffer | null = null;
          
          // First try Thirdweb SDK
          try {
            const ipfsUrl = `ipfs://${cleanHash}`;
            console.log(chalk.gray(`Trying Thirdweb SDK with URL: ${ipfsUrl}`));
            
            const fileContent = await sdk.storage.download(ipfsUrl);
            arrayBuffer = await fileContent.arrayBuffer();
            downloaded = true;
            console.log(chalk.green('✓ Downloaded via Thirdweb SDK'));
            
          } catch (sdkError: any) {
            console.log(chalk.yellow('Thirdweb SDK download failed, trying public gateways...'));
            
            // Try public gateways
            for (const gateway of gateways) {
              try {
                console.log(chalk.gray(`Trying gateway: ${gateway}`));
                const response = await fetch(gateway);
                
                if (!response.ok) {
                  console.log(chalk.red(`Gateway failed: ${response.status} ${response.statusText}`));
                  continue;
                }
                
                arrayBuffer = await response.arrayBuffer();
                downloaded = true;
                console.log(chalk.green(`✓ Downloaded via ${gateway}`));
                break;
                
              } catch (gatewayError: any) {
                console.log(chalk.red(`Gateway error: ${gatewayError.message}`));
                continue;
              }
            }
          }
          
          if (!downloaded || !arrayBuffer) {
            throw new Error('Failed to download file from all available sources');
          }
          
          // Detect file type and get appropriate extension
          const extension = detectFileExtension(arrayBuffer);
          const outputPath = `ipfs-download-${Date.now()}${extension}`;
          await fs.writeFile(outputPath, new Uint8Array(arrayBuffer));

          spinner.succeed(chalk.green('✅ File downloaded from IPFS successfully!'));
          console.log(chalk.blue('💾 Saved to:'), outputPath);
          console.log(chalk.blue('📏 File size:'), `${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
          console.log(chalk.blue('📄 File type:'), extension.substring(1).toUpperCase());
          
          // If it's an HTML file, warn the user
          if (extension === '.html') {
            console.log(chalk.yellow('\n⚠️  Warning: Downloaded file appears to be an HTML error page.'));
            console.log(chalk.yellow('This might indicate that the IPFS hash is invalid or the file is not accessible.'));
            console.log(chalk.yellow('Please check the IPFS hash and try again.'));
          }
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ IPFS operation failed'));
      
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