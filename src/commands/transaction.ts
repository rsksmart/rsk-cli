import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import inquirer from "inquirer";
import { Address, parseEther, formatEther } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";

type TransactionType = 'simple' | 'advanced' | 'raw';

interface AdvancedTransactionOptions {
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  data?: `0x${string}`;
}

export async function transactionCommand(
  testnet: boolean,
  toAddress?: Address,
  value?: number,
  name?: string,
  tokenAddress?: Address,
  options?: AdvancedTransactionOptions
) {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return;
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    if (!walletsData.currentWallet || !walletsData.wallets) {
      console.log(chalk.red("⚠️ No valid wallet found. Please create or import a wallet first."));
      return;
    }

    const { currentWallet, wallets } = walletsData;
    let wallet = name ? wallets[name] : wallets[currentWallet];
    if (!wallet) {
      console.log(chalk.red("⚠️ Wallet not found."));
      return;
    }

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(name);
    const account = walletClient.account;

    if (!account) {
      console.log(chalk.red("⚠️ Failed to retrieve the account."));
      return;
    }

    if (!toAddress || !value) {
      const transactionType = await promptTransactionType();
      const txDetails = await promptTransactionDetails(transactionType, publicClient, wallet.address);
      
      toAddress = txDetails.to;
      value = txDetails.value;
      tokenAddress = txDetails.tokenAddress;
      options = txDetails.options;
    }

    if (!toAddress || value === undefined) {
      throw new Error("Recipient address and value are required");
    }

    const gasPrice = await publicClient.getGasPrice();
    const formattedGasPrice = formatEther(gasPrice);
    console.log(chalk.white(`⛽ Current Gas Price: ${formattedGasPrice} RBTC`));

    if (tokenAddress) {
      await handleTokenTransfer(
        publicClient,
        walletClient,
        account,
        tokenAddress,
        toAddress,
        value,
        wallet.address,
        testnet,
        options
      );
    } else {
      await handleRBTCTransfer(
        publicClient,
        walletClient,
        account,
        toAddress,
        value,
        wallet.address,
        testnet,
        options
      );
    }
  } catch (error) {
    console.error(chalk.red("🚨 Error:"), chalk.yellow("Error during transaction, please check the transaction details."));
  }
}

async function promptTransactionType(): Promise<TransactionType> {
  const { type } = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: '📝 What type of transaction would you like to create?',
      choices: [
        { name: 'Simple Transfer (RBTC or Token)', value: 'simple' },
        { name: 'Advanced Transfer (with custom gas settings)', value: 'advanced' },
        { name: 'Raw Transaction (with custom data)', value: 'raw' }
      ]
    }
  ]);
  return type;
}

async function promptTransactionDetails(type: TransactionType, publicClient: any, fromAddress: Address) {
  const details: any = {};

  const common = await inquirer.prompt([
    {
      type: 'input',
      name: 'to',
      message: '🎯 Enter recipient address:',
      validate: (input) => input.startsWith('0x') && input.length === 42
    },
    {
      type: 'confirm',
      name: 'isToken',
      message: '🪙 Is this a token transfer?',
      default: false
    }
  ]);

  details.to = common.to as Address;

  if (common.isToken) {
    const tokenDetails = await inquirer.prompt([
      {
        type: 'input',
        name: 'tokenAddress',
        message: '📝 Enter token contract address:',
        validate: async (input) => {
          if (!input.startsWith('0x') || input.length !== 42) return false;
          return await isERC20Contract(publicClient, input as Address);
        }
      }
    ]);
    details.tokenAddress = tokenDetails.tokenAddress as Address;

    const { decimals } = await getTokenInfo(publicClient, details.tokenAddress, fromAddress);
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: '💰 Enter amount to transfer:',
        validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0
      }
    ]);
    details.value = parseFloat(value);
  } else {
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: '💰 Enter amount in RBTC:',
        validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0
      }
    ]);
    details.value = parseFloat(value);
  }

  if (type === 'advanced' || type === 'raw') {
    const advanced = await inquirer.prompt([
      {
        type: 'input',
        name: 'gasLimit',
        message: '⛽ Enter gas limit (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'maxFeePerGas',
        message: '💰 Enter max fee per gas in RBTC (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'maxPriorityFeePerGas',
        message: '💰 Enter max priority fee per gas in RBTC (optional):',
        default: ''
      }
    ]);

    details.options = {
      ...(advanced.gasLimit && { gasLimit: BigInt(advanced.gasLimit) }),
      ...(advanced.maxFeePerGas && { maxFeePerGas: parseEther(advanced.maxFeePerGas.toString()) }),
      ...(advanced.maxPriorityFeePerGas && { maxPriorityFeePerGas: parseEther(advanced.maxPriorityFeePerGas.toString()) })
    };

    if (type === 'raw') {
      const { data } = await inquirer.prompt([
        {
          type: 'input',
          name: 'data',
          message: '📝 Enter transaction data (hex):',
          validate: (input) => input.startsWith('0x')
        }
      ]);
      details.options.data = data as `0x${string}`;
    }
  }

  return details;
}

async function handleTokenTransfer(
  publicClient: any,
  walletClient: any,
  account: any,
  tokenAddress: Address,
  toAddress: Address,
  value: number,
  fromAddress: Address,
  testnet: boolean,
  options?: AdvancedTransactionOptions
) {
  const tokenInfo = await getTokenInfo(publicClient, tokenAddress, fromAddress);
  
  console.log(chalk.white('\n📄 Token Transfer Details:'));
  console.log(chalk.white(`Token: ${tokenInfo.name} (${tokenInfo.symbol})`));
  console.log(chalk.white(`Contract: ${tokenAddress}`));
  console.log(chalk.white(`From: ${fromAddress}`));
  console.log(chalk.white(`To: ${toAddress}`));
  console.log(chalk.white(`Amount: ${value} ${tokenInfo.symbol}`));

  const spinner = ora('⏳ Simulating token transfer...').start();
  
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: tokenAddress,
      abi: [{
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ type: 'bool' }]
      }],
      functionName: 'transfer',
      args: [toAddress, BigInt(value * (10 ** tokenInfo.decimals))],
      ...options
    });

    spinner.succeed('✅ Simulation successful');

    const txHash = await walletClient.writeContract(request);
    await handleTransactionReceipt(publicClient, txHash, testnet);
  } catch (error) {
    spinner.fail('❌ Transaction failed');
    throw error;
  }
}

async function handleRBTCTransfer(
  publicClient: any,
  walletClient: any,
  account: any,
  toAddress: Address,
  value: number,
  fromAddress: Address,
  testnet: boolean,
  options?: AdvancedTransactionOptions
) {
  console.log(chalk.white('\n📄 RBTC Transfer Details:'));
  console.log(chalk.white(`From: ${fromAddress}`));
  console.log(chalk.white(`To: ${toAddress}`));
  console.log(chalk.white(`Amount: ${value} RBTC`));

  const spinner = ora('⏳ Preparing transaction...').start();

  try {
    const txHash = await walletClient.sendTransaction({
      account,
      to: toAddress,
      value: parseEther(value.toString()),
      ...options
    });

    spinner.succeed('✅ Transaction sent');
    await handleTransactionReceipt(publicClient, txHash, testnet);
  } catch (error) {
    spinner.fail('❌ Transaction failed');
    throw error;
  }
}

async function handleTransactionReceipt(publicClient: any, txHash: `0x${string}`, testnet: boolean) {
  const spinner = ora('⏳ Waiting for confirmation...').start();
  
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    spinner.stop();

    if (receipt.status === 'success') {
      console.log(chalk.green('\n✅ Transaction confirmed successfully!'));
      console.log(chalk.white(`📦 Block Number: ${receipt.blockNumber}`));
      console.log(chalk.white(`⛽ Gas Used: ${receipt.gasUsed}`));
      
      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
        : `https://explorer.rootstock.io/tx/${txHash}`;
      console.log(chalk.white(`🔗 View on Explorer: ${chalk.dim(explorerUrl)}`));
    } else {
      console.log(chalk.red('\n❌ Transaction failed'));
    }
  } catch (error) {
    spinner.fail('❌ Transaction confirmation failed');
    throw error;
  }
} 