import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const walletFilePath = path.join(process.cwd(), 'rootstock-wallet.json');

type InquirerAnswers = {
  action?: string;
  password?: string;
  saveWallet?: boolean;
  privateKey?: string;
  address?: string;
};

export async function createWalletCommand() {
  try {
    // Step 1: Check if a wallet already exists
    if (fs.existsSync(walletFilePath)) {
      const questions: any = [
        {
          type: 'list',
          name: 'action',
          message: '🔍 A saved wallet was found. What would you like to do?',
          choices: [
            '🗂️  Use existing wallet',
            '🆕 Create a new wallet',
            '🔑 Insert wallet address and private key',
          ],
        },
      ];

      const { action } = await inquirer.prompt<InquirerAnswers>(questions);

      if (action === '🗂️ Use existing wallet') {
        // Decrypt the existing wallet
        const encryptedWalletData: { encryptedPrivateKey: string, iv: string } = JSON.parse(fs.readFileSync(walletFilePath, 'utf8'));
        const passwordQuestion: any = [
          {
            type: 'password',
            name: 'password',
            message: '🔒 Enter your password to decrypt the wallet:',
            mask: '*',
          },
        ];

        const { password } = await inquirer.prompt<InquirerAnswers>(passwordQuestion);

        try {
          const iv = Buffer.from(encryptedWalletData.iv, 'hex');
          const key = crypto.scryptSync(password!, iv, 32); // Derive a key using the password
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

          let decryptedPrivateKey = decipher.update(encryptedWalletData.encryptedPrivateKey, 'hex', 'utf8');
          decryptedPrivateKey += decipher.final('utf8');

          // Ensure the private key has the '0x' prefix and enforce the type
          const prefixedPrivateKey = `0x${decryptedPrivateKey.replace(/^0x/, '')}` as `0x${string}`;
          const account = privateKeyToAccount(prefixedPrivateKey);
          console.log(chalk.green('✅ Wallet decrypted successfully!'));
          console.log(chalk.white(`📄 Address:`), chalk.green(`${chalk.bold(account.address)}`));
        } catch (error) {
          console.error(chalk.red('❌ Failed to decrypt the wallet. Please check your password.'));
        }
        return;
      } else if (action === '🔑 Insert wallet address and private key') {
        // Allow user to input their wallet address and private key
        const inputQuestions: any = [
          {
            type: 'input',
            name: 'address',
            message: '🏷️ Enter your wallet address:',
          },
          {
            type: 'password',
            name: 'privateKey',
            message: '🔑 Enter your private key:',
            mask: '*',
          },
        ];

        const { address, privateKey } = await inquirer.prompt<InquirerAnswers>(inputQuestions);

        // Confirm the provided address and private key
        const prefixedPrivateKey = `0x${privateKey!.replace(/^0x/, '')}` as `0x${string}`;
        const account = privateKeyToAccount(prefixedPrivateKey);

        if (account.address.toLowerCase() === address!.toLowerCase()) {
          console.log(chalk.green('✅ Wallet validated successfully!'));
          console.log(chalk.white(`📄 Address:`), chalk.green(`${chalk.bold(account.address)}`));

          // Prompt to save the wallet securely
          const saveWalletQuestion: any = [
            {
              type: 'confirm',
              name: 'saveWallet',
              message: '💾 Would you like to save this wallet securely for future use?',
              default: true,
            },
          ];

          const { saveWallet } = await inquirer.prompt<InquirerAnswers>(saveWalletQuestion);

          if (saveWallet) {
            const passwordQuestion: any = [
              {
                type: 'password',
                name: 'password',
                message: '🔒 Enter a password to encrypt your wallet:',
                mask: '*',
              },
            ];

            const { password } = await inquirer.prompt<InquirerAnswers>(passwordQuestion);

            // Generate a random IV
            const iv = crypto.randomBytes(16);
            const key = crypto.scryptSync(password!, iv, 32); // Derive a key using the password
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            
            let encryptedPrivateKey = cipher.update(prefixedPrivateKey, 'utf8', 'hex');
            encryptedPrivateKey += cipher.final('hex');

            const walletData = {
              address: account.address,
              encryptedPrivateKey: encryptedPrivateKey,
              iv: iv.toString('hex'),
            };

            fs.writeFileSync(walletFilePath, JSON.stringify(walletData, null, 2), 'utf8');
            console.log(chalk.green(`💾 Wallet saved securely at ${walletFilePath}`));
          }
        } else {
          console.log(chalk.red('❌ The provided private key does not match the provided address.'));
        }
        return;
      }
    }

    // Step 2: If no existing wallet or creating a new one, generate a private key
    const privateKey: string = generatePrivateKey();
    const prefixedPrivateKey: `0x${string}` = `0x${privateKey.replace(/^0x/, '')}` as `0x${string}`;
    const account = privateKeyToAccount(prefixedPrivateKey);

    // Output the wallet details
    console.log(chalk.rgb(255, 165, 0)(`🎉 Wallet created successfully on Rootstock!`));
    console.log(chalk.white(`📄 Address:`), chalk.green(`${chalk.bold(account.address)}`));
    console.log(chalk.white(`🔑 Private Key:`), chalk.green(`${chalk.bold(prefixedPrivateKey)}`));
    console.log(chalk.gray('🔒 Please save the private key in a secure location.'));

    // Step 3: Prompt to save the new wallet
    const saveWalletQuestion: any = [
      {
        type: 'confirm',
        name: 'saveWallet',
        message: '💾 Would you like to save this wallet securely for future use?',
        default: true,
      },
    ];

    const { saveWallet } = await inquirer.prompt<InquirerAnswers>(saveWalletQuestion);

    if (saveWallet) {
      const passwordQuestion: any = [
        {
          type: 'password',
          name: 'password',
          message: '🔒 Enter a password to encrypt your wallet:',
          mask: '*',
        },
      ];

      const { password } = await inquirer.prompt<InquirerAnswers>(passwordQuestion);

      // Generate a random IV
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(password!, iv, 32); // Derive a key using the password
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encryptedPrivateKey = cipher.update(prefixedPrivateKey, 'utf8', 'hex');
      encryptedPrivateKey += cipher.final('hex');

      const walletData = {
        address: account.address,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv.toString('hex'),
      };

      fs.writeFileSync(walletFilePath, JSON.stringify(walletData, null, 2), 'utf8');
      console.log(chalk.green(`💾 Wallet saved securely at ${walletFilePath}`));
    }
  } catch (error: any) {
    console.error(chalk.red('❌ Error creating or managing wallet:'), chalk.yellow(error.message || error));
  }
}
