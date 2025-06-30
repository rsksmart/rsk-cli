import { ethers } from 'ethers';
import chalk from 'chalk';
import { fetchContractAbi } from '../utils/fetchContractAbi.js';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import * as crypto from 'crypto';

// Custom error classes
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

class ParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterError';
  }
}

// Error handler
function handleError(error: unknown) {
  if (error instanceof NetworkError) {
    console.error(chalk.red('Network Error:'), error.message);
  } else if (error instanceof WalletError) {
    console.error(chalk.red('Wallet Error:'), error.message);
  } else if (error instanceof ParameterError) {
    console.error(chalk.red('Parameter Error:'), error.message);
  } else {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
  process.exit(1);
}

export async function writeCommand(
  testnet: boolean,
  walletName?: string,
  address?: string,
  functionName?: string,
  params?: string[],
  gasLimit?: string,
  priorityFee?: string,
  rpcUrl?: string,
  abi?: string
) {
  try {
    // Debug: Show testnet flag
    console.log(chalk.gray(`Testnet flag: ${testnet}`));

    // Validate required parameters
    if (!address) {
      throw new ParameterError(
        '❌ Contract address is required. Use -a <address> to specify the contract.'
      );
    }
    if (!functionName) {
      throw new ParameterError(
        '❌ Function name is required. Use -f <functionName> to specify the function to call.'
      );
    }
    if (!params) {
      params = [];
    }

    // Debug: Show received address
    console.log(chalk.gray(`Received address: "${address}"`));
    console.log(chalk.gray(`Address length: ${address.length}`));

    // Validate contract address
    if (!ethers.isAddress(address)) {
      throw new ParameterError(
        `❌ Invalid contract address: "${address}". Please provide a valid Ethereum address (0x followed by 40 hexadecimal characters).`
      );
    }

    // Get network configuration based on testnet flag
    const networkConfig = {
      name: testnet ? 'RSK Testnet' : 'RSK Mainnet',
      rpcUrl:
        rpcUrl ||
        (testnet
          ? 'https://public-node.testnet.rsk.co'
          : 'https://public-node.rsk.co'),
      explorerUrl: testnet
        ? 'https://rootstock-testnet.blockscout.com'
        : 'https://explorer.rsk.co',
    };

    console.log(chalk.blue(`🌐 Using network: ${networkConfig.name}`));

    // Connect to network
    let provider;
    try {
      provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    } catch (err) {
      throw new NetworkError(
        `❌ Failed to connect to ${networkConfig.name}. Please check your internet connection and try again.`
      );
    }

    // Load wallet: --wallet <name> (custom wallet file) or use current wallet
    let wallet;
    if (walletName) {
      // Use specified wallet from custom wallet file
      const walletFilePath = path.join(process.cwd(), 'rootstock-wallet.json');
      if (!fs.existsSync(walletFilePath)) {
        throw new WalletError(
          `❌ Wallet file not found: ${walletFilePath}\n💡 Please create a wallet first using 'rsk-cli wallet'`
        );
      }

      const walletsData = JSON.parse(fs.readFileSync(walletFilePath, 'utf-8'));
      if (!walletsData.wallets || !walletsData.wallets[walletName]) {
        throw new WalletError(
          `❌ Wallet '${walletName}' not found in wallet file.\n💡 Available wallets: ${Object.keys(
            walletsData.wallets || {}
          ).join(', ')}`
        );
      }

      const walletData = walletsData.wallets[walletName];
      if (!walletData.encryptedPrivateKey || !walletData.iv) {
        throw new WalletError(
          `❌ No encrypted private key found for wallet '${walletName}'.\n💡 Please recreate the wallet using 'rsk-cli wallet'`
        );
      }

      // Prompt for password to decrypt the private key
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const promptPassword = (q: string) =>
        new Promise<string>((resolve) => rl.question(q, (ans) => resolve(ans)));
      const password = await promptPassword('🔒 Enter your wallet password: ');
      rl.close();

      try {
        // Decrypt the private key using the password and IV
        const decipherIv = Uint8Array.from(Buffer.from(walletData.iv, 'hex'));
        const key = crypto.scryptSync(password, decipherIv, 32);
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Uint8Array.from(key),
          decipherIv
        );

        let decrypted = decipher.update(
          walletData.encryptedPrivateKey,
          'hex',
          'utf8'
        );
        decrypted += decipher.final('utf8');

        // Ensure the private key has 0x prefix
        const privateKey = decrypted.startsWith('0x')
          ? decrypted
          : `0x${decrypted}`;

        wallet = new ethers.Wallet(privateKey, provider);
      } catch (err) {
        throw new WalletError(
          `❌ Failed to decrypt wallet: ${
            err instanceof Error ? err.message : err
          }\n💡 Please check your password and try again.`
        );
      }
    } else {
      // Use current wallet automatically
      const walletFilePath = path.join(process.cwd(), 'rootstock-wallet.json');
      if (!fs.existsSync(walletFilePath)) {
        throw new WalletError(
          `❌ No wallet file found: ${walletFilePath}\n💡 Please create a wallet first using 'rsk-cli wallet'`
        );
      }

      const walletsData = JSON.parse(fs.readFileSync(walletFilePath, 'utf-8'));
      if (
        !walletsData.currentWallet ||
        !walletsData.wallets ||
        !walletsData.wallets[walletsData.currentWallet]
      ) {
        throw new WalletError(
          `❌ No current wallet found.\n💡 Please set a current wallet using 'rsk-cli wallet' or specify a wallet with --wallet <name>`
        );
      }

      const currentWalletName = walletsData.currentWallet;
      const walletData = walletsData.wallets[currentWalletName];

      if (!walletData.encryptedPrivateKey || !walletData.iv) {
        throw new WalletError(
          `❌ No encrypted private key found for current wallet '${currentWalletName}'.\n💡 Please recreate the wallet using 'rsk-cli wallet'`
        );
      }

      console.log(chalk.blue(`🔑 Using current wallet: ${currentWalletName}`));

      // Prompt for password to decrypt the private key
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const promptPassword = (q: string) =>
        new Promise<string>((resolve) => rl.question(q, (ans) => resolve(ans)));
      const password = await promptPassword('🔒 Enter your wallet password: ');
      rl.close();

      try {
        // Decrypt the private key using the password and IV
        const decipherIv = Uint8Array.from(Buffer.from(walletData.iv, 'hex'));
        const key = crypto.scryptSync(password, decipherIv, 32);
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Uint8Array.from(key),
          decipherIv
        );

        let decrypted = decipher.update(
          walletData.encryptedPrivateKey,
          'hex',
          'utf8'
        );
        decrypted += decipher.final('utf8');

        // Ensure the private key has 0x prefix
        const privateKey = decrypted.startsWith('0x')
          ? decrypted
          : `0x${decrypted}`;

        wallet = new ethers.Wallet(privateKey, provider);
      } catch (err) {
        throw new WalletError(
          `❌ Failed to decrypt current wallet: ${
            err instanceof Error ? err.message : err
          }\n💡 Please check your password and try again.`
        );
      }
    }

    // Check wallet balance
    try {
      const balance = await provider.getBalance(wallet.address);
      if (balance === 0n) {
        throw new WalletError(
          `❌ Insufficient funds in wallet ${
            wallet.address
          }.\n💡 Please add some ${testnet ? 'tRBTC' : 'RBTC'} to your wallet.`
        );
      }
      console.log(
        chalk.green(
          `💰 Wallet balance: ${ethers.formatEther(balance)} ${
            testnet ? 'tRBTC' : 'RBTC'
          }`
        )
      );
    } catch (err) {
      throw new WalletError(
        `❌ Failed to check wallet balance: ${
          err instanceof Error ? err.message : err
        }`
      );
    }

    // Prepare contract
    let contract;
    if (abi) {
      try {
        const parsedAbi = JSON.parse(abi);
        contract = new ethers.Contract(address, parsedAbi, wallet);
      } catch (err) {
        throw new ParameterError(
          `❌ Invalid ABI format: ${
            err instanceof Error ? err.message : err
          }\n💡 Please provide a valid JSON ABI string.`
        );
      }
    } else {
      let abi;
      try {
        console.log(chalk.blue('🔍 Fetching contract ABI from explorer...'));
        abi = await fetchContractAbi(
          address,
          networkConfig.explorerUrl,
          testnet
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : err;
        console.log(chalk.yellow('⚠️  ABI fetching failed. You can:'));
        console.log(
          chalk.yellow(
            '   1. Provide the ABI manually using --abi <json_string>'
          )
        );
        console.log(chalk.yellow('   2. Use a verified contract address'));
        console.log(
          chalk.yellow(
            '   3. Check if the contract is deployed and verified on the explorer'
          )
        );
        console.log(chalk.yellow(''));
        console.log(chalk.yellow('Example for a simple storage contract:'));
        console.log(
          chalk.gray(
            '--abi \'[{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"}],"name":"setStoredData","outputs":[],"stateMutability":"nonpayable","type":"function"}]\''
          )
        );
        throw new ParameterError(
          `❌ Failed to fetch contract ABI: ${errorMessage}`
        );
      }
      contract = new ethers.Contract(address, abi, wallet);
    }

    // Prepare transaction options
    const txOptions: any = {};
    if (gasLimit) {
      try {
        txOptions.gasLimit = BigInt(gasLimit);
      } catch (err) {
        throw new ParameterError(
          `❌ Invalid gas limit: "${gasLimit}". Please provide a valid number.`
        );
      }
    }
    if (priorityFee) {
      try {
        txOptions.maxPriorityFeePerGas = ethers.parseUnits(priorityFee, 'gwei');
      } catch (err) {
        throw new ParameterError(
          `❌ Invalid priority fee: "${priorityFee}". Please provide a valid number in gwei.`
        );
      }
    }

    // Execute function
    console.log(chalk.blue(`🚀 Calling function: ${functionName}`));
    try {
      // Non-existent function
      if (typeof contract[functionName] !== 'function') {
        throw new ParameterError(
          `❌ Function '${functionName}' does not exist on the contract.\n` +
            '💡 Possible reasons:\n' +
            '- Typo in the function name\n' +
            '- The function is not public or external\n' +
            '- The function is not present in the contract ABI (contract may not be verified)\n' +
            '- The ABI fetched from the explorer is incomplete or incorrect'
        );
      }

      // Log function details for debugging
      const contractAbi = contract.interface.fragments || [];
      const fnFragment = contractAbi.find(
        (f: any) => f.name === functionName && f.type === 'function'
      );

      if (fnFragment) {
        console.log(
          chalk.gray(`📝 Function signature: ${fnFragment.format()}`)
        );
        console.log(
          chalk.gray(
            `📋 Input parameters: ${fnFragment.inputs
              .map((i: any) => `${i.type} ${i.name}`)
              .join(', ')}`
          )
        );
        console.log(
          chalk.gray(`📤 Provided parameters: [${params?.join(', ')}]`)
        );

        // Check if function is view/pure (read-only)
        const functionFragment = fnFragment as any;
        if (
          functionFragment.stateMutability === 'view' ||
          functionFragment.stateMutability === 'pure'
        ) {
          console.log(
            chalk.yellow(
              '⚠️  This is a read-only function. Use "rsk-cli contract" command instead.'
            )
          );
          throw new ParameterError(
            '❌ Cannot call read-only function with write command. Use "rsk-cli contract" for read operations.'
          );
        }

        // Validate parameter count (NEW: Added parameter count validation)
        if (params!.length !== fnFragment.inputs.length) {
          const expected = fnFragment.inputs.length;
          const received = params!.length;
          throw new ParameterError(
            `❌ Parameter count mismatch for function '${functionName}'.\n` +
              `📋 Expected: ${expected} parameter(s)\n` +
              `📤 Received: ${received} parameter(s)\n` +
              `📝 Function signature: ${fnFragment.format()}`
          );
        }

        // Strict boolean parameter validation (IMPROVED: Better undefined handling)
        fnFragment.inputs.forEach((input: any, idx: number) => {
          if (input.type === 'bool') {
            const val = params![idx];
            // Check for undefined or null values first
            if (val === undefined || val === null) {
              throw new ParameterError(
                `❌ Parameter ${idx + 1} ('${
                  input.name
                }') for function '${functionName}' is missing. Expected a boolean value ('true' or 'false').`
              );
            }
            // Check if it's a valid boolean string
            if (
              typeof val !== 'string' ||
              (val.toLowerCase() !== 'true' && val.toLowerCase() !== 'false')
            ) {
              throw new ParameterError(
                `❌ Parameter ${idx + 1} ('${
                  input.name
                }') for function '${functionName}' must be 'true' or 'false' (case-insensitive). Received: '${val}'`
              );
            }
            // Convert to boolean for ethers
            params![idx] = (val.toLowerCase() === 'true').toString();
          }
        });
      }

      // Execute the function
      const tx = await contract[functionName](...params, txOptions);
      console.log(chalk.green('✅ Transaction sent!'));
      console.log(chalk.blue('🔗 Transaction hash:'), tx.hash);

      // Wait for confirmation
      console.log(chalk.blue('⏳ Waiting for confirmation...'));
      const receipt = await tx.wait();
      console.log(chalk.green('✅ Transaction confirmed successfully!'));
      console.log(chalk.blue('📦 Block number:'), receipt.blockNumber);
      console.log(chalk.blue('⛽ Gas used:'), receipt.gasUsed.toString());

      const explorerUrl = testnet
        ? `https://rootstock-testnet.blockscout.com/tx/${tx.hash}`
        : `https://explorer.rsk.co/tx/${tx.hash}`;
      console.log(chalk.blue('🔍 View on Explorer:'), explorerUrl);
    } catch (err) {
      if (err instanceof Error) {
        // Check for specific error types
        if (err.message.includes('execution reverted')) {
          console.log(
            chalk.red('❌ Contract function call reverted. Possible reasons:')
          );
          console.log(
            chalk.yellow(
              '   - Access control: Function may have onlyOwner or other restrictions'
            )
          );
          console.log(
            chalk.yellow(
              '   - Parameter validation: Function may have input validation that failed'
            )
          );
          console.log(
            chalk.yellow(
              '   - State requirements: Function may require specific contract state'
            )
          );
          console.log(
            chalk.yellow('   - Gas limit: Transaction may need more gas')
          );
          console.log(
            chalk.yellow(
              '   - Network issues: RPC endpoint may be having issues'
            )
          );
          console.log(chalk.gray(''));
          console.log(chalk.gray('💡 Try:'));
          console.log(
            chalk.gray('   - Check if you have the required permissions')
          );
          console.log(
            chalk.gray('   - Verify the function parameters are correct')
          );
          console.log(
            chalk.gray('   - Increase gas limit with --gas-limit <value>')
          );
          console.log(
            chalk.gray(
              '   - Check the contract source code for access modifiers'
            )
          );
        } else if (err.message.includes('no matching fragment')) {
          throw new ParameterError(
            `❌ No matching function found for '${functionName}' with the provided parameters.\n` +
              '💡 Check that the function name is correct and the number/types of parameters match the contract ABI.'
          );
        } else if (
          err.message.includes('BigNumberish') ||
          err.message.includes('BigInt') ||
          err.message.includes('INVALID_ARGUMENT')
        ) {
          throw new ParameterError(
            `❌ Invalid parameter value: ${err.message}`
          );
        }
        throw new ParameterError(
          `❌ Contract function call failed: ${err.message}`
        );
      }
      throw new ParameterError(`❌ Contract function call failed: ${err}`);
    }
  } catch (error) {
    handleError(error);
  }
}
