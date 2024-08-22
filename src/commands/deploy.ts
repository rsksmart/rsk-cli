import ViemProvider from '../utils/viemProvider.js';
import chalk from 'chalk';
import fs from 'fs';

export async function deployCommand(
  abiPath: string, 
  bytecodePath: string, 
  testnet: boolean, 
  args: any[] = []
): Promise<void> {
  try {
    console.log(chalk.blue(`🔧 Initializing ViemProvider for ${testnet ? 'testnet' : 'mainnet'}...`));
    const provider = new ViemProvider(testnet ? 'rootstockTestnet' : 'rootstock');
    const walletClient = await provider.getWalletClient();

    if (!walletClient.account) {
      console.error(chalk.red('🚨 Wallet account is undefined. Make sure the wallet is properly loaded.'));
      return;
    }

    console.log(chalk.blue(`🔑 Wallet account: ${walletClient.account.address}`));

    console.log(chalk.blue(`📄 Reading ABI from ${abiPath}...`));
    const abiContent = fs.readFileSync(abiPath, 'utf8');
    const abi = JSON.parse(abiContent);

    if (!Array.isArray(abi)) {
      console.error(chalk.red('⚠️ The ABI file is not a valid JSON array.'));
      return;
    }

    console.log(chalk.blue(`📄 Reading Bytecode from ${bytecodePath}...`));
    let bytecode = fs.readFileSync(bytecodePath, 'utf8').trim();
    if (!bytecode.startsWith('0x')) {
      bytecode = `0x${bytecode}`;
    }

    if (!bytecode) {
      console.error(chalk.red('⚠️ Invalid Bytecode file.'));
      return;
    }

    console.log(chalk.green(`🚀 Deploying contract to ${testnet ? 'testnet' : 'mainnet'}...`));

    const deployParams = {
      abi,
      bytecode: bytecode as `0x${string}`,
      account: walletClient.account.address as `0x${string}`,
      args,  // Constructor arguments, if any
    };

    console.log(chalk.blue(`📊 Deployment Parameters: ${JSON.stringify(deployParams, null, 2)}`));

    // @ts-ignore: Suppress type error related to the deployContract method
    const hash = await walletClient.deployContract(deployParams);

    console.log(chalk.green(`🎉 Contract deployment transaction sent!`));
    console.log(chalk.green(`🔑 Transaction Hash: ${hash}`));

    console.log(chalk.blue(`⏳ Waiting for transaction receipt...`));
    const publicClient = await provider.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log(chalk.blue(`📝 Transaction Receipt: ${JSON.stringify(receipt, null, 2)}`));

    console.log(chalk.green(`📜 Contract deployed successfully!`));
    console.log(chalk.green(`📍 Contract Address: ${receipt.contractAddress}`));
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error deploying contract:'), chalk.yellow(error.message));
      console.error(chalk.red('📋 Stack trace:'), chalk.yellow(error.stack));

      // Log the raw response body if it's an HTTP error
      if ('response' in error && error.response) {
        console.error(chalk.red('📄 Response Body:'), chalk.yellow(JSON.stringify(error.response)));
      }
    } else {
      console.error(chalk.red('🚨 An unknown error occurred.'));
    }
  }
}
