import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import fs from "fs";
import inquirer from "inquirer";
import { Address, parseEther, formatEther, getAddress } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import { getConfig } from "./config.js";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

interface TransactionCommandOptions {
  isExternal?: boolean;
}

type TransactionType = 'simple' | 'advanced' | 'raw';

interface AdvancedTransactionOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  data?: `0x${string}`;
}

export async function transactionCommand(
  testnet?: boolean,
  toAddress?: Address,
  value?: number,
  name?: string,
  tokenAddress?: Address,
  options?: AdvancedTransactionOptions,
  isExternal?: boolean
) {
  const config = getConfig();
  const isTestnet = testnet !== undefined ? testnet : (config.defaultNetwork === 'testnet');
  const params: TransactionCommandOptions = { isExternal };
  
  logInfo(params.isExternal || false, `Network: ${isTestnet ? 'Testnet' : 'Mainnet'}`);
  
  try {
    if (!fs.existsSync(walletFilePath)) {
      logError(params.isExternal || false, "No saved wallet found. Please create a wallet first.");
      return;
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    if (!walletsData.currentWallet || !walletsData.wallets) {
      logError(params.isExternal || false,"No valid wallet found. Please create or import a wallet first.");
      return;
    }

    const { currentWallet, wallets } = walletsData;
    let wallet = name ? wallets[name] : wallets[currentWallet];
    if (!wallet) {
      logError(params.isExternal || false,"Wallet not found.");
      return;
    }

    const provider = new ViemProvider(isTestnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(name);
    const account = walletClient.account;

    if (!account) {
      logError(params.isExternal || false,"Failed to retrieve the account.");
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

    try {
      toAddress = getAddress(toAddress);
    } catch (error) {
      logError(params.isExternal || false,`Invalid recipient address: ${toAddress}. Please provide a valid Ethereum address.`);
      throw new Error(`Invalid recipient address: ${toAddress}. Please provide a valid Ethereum address.`);
    }

    if (tokenAddress) {
      try {
        tokenAddress = getAddress(tokenAddress);
      } catch (error) {
        logError(params.isExternal || false,`Invalid token address: ${tokenAddress}. Please provide a valid Ethereum address.`);
        throw new Error(`Invalid token address: ${tokenAddress}. Please provide a valid Ethereum address.`);
      }
    }

    const fixedValue = typeof value === 'number' ? value.toFixed(18) : String(value);
    const numericValue = parseFloat(fixedValue);
    
    if (numericValue <= 0) {
      throw new Error("Transaction value must be greater than 0");
    }

    const stringValue = numericValue.toFixed(18);

    const gasPrice = await publicClient.getGasPrice();
    const formattedGasPrice = formatEther(gasPrice);
    logInfo(params.isExternal || false, `Current Gas Price: ${formattedGasPrice} RBTC`);

    logInfo(params.isExternal || false, `Checking balance for address: ${wallet.address}`);
    const balance = await publicClient.getBalance({ address: wallet.address });
    const balanceInRBTC = formatEther(balance);
    logInfo(params.isExternal || false, `Wallet Balance: ${balanceInRBTC} RBTC`);
    logInfo(params.isExternal || false, `Network RPC: ${isTestnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'}`);
    
    if (balance === 0n) {
      logError(params.isExternal || false, "Wallet balance is 0 RBTC.");
      logWarning(params.isExternal || false, "You need to fund your wallet first.");
      logInfo(params.isExternal || false, `Your wallet address: ${wallet.address}`);
      logInfo(params.isExternal || false, "Options to get RBTC:");
      logInfo(params.isExternal || false, "   1. Use a faucet: https://faucet.rootstock.io/");
      logInfo(params.isExternal || false, "   2. Buy RBTC from an exchange");
      logInfo(params.isExternal || false, "   3. Receive RBTC from another wallet");
      logInfo(params.isExternal || false, "   4. Check your balance with: rsk-cli balance");
      return;
    }
    
    if (balance < parseEther(stringValue)) {
      logError(params.isExternal || false, "Insufficient balance for this transaction.");
      logWarning(params.isExternal || false, `Required: ${numericValue} RBTC, Available: ${balanceInRBTC} RBTC`);
      logWarning(params.isExternal || false, `You need ${(numericValue - parseFloat(balanceInRBTC)).toFixed(6)} more RBTC`);
      return;
    }

    if (tokenAddress) {
      await handleTokenTransfer(
        publicClient,
        walletClient,
        account,
        tokenAddress,
        toAddress,
        parseFloat(stringValue),
        wallet.address,
        isTestnet,
        options,
        params
      );
    } else {
      await handleRBTCTransfer(
        publicClient,
        walletClient,
        account,
        toAddress,
        parseFloat(stringValue),
        wallet.address,
        isTestnet,
        options,
        balance,
        params
      );
    }
  } catch (error: any) {
    logError(params.isExternal || false, "Error during transaction, please check the transaction details.");
    logError(params.isExternal || false, `Error details: ${error.message || error}`);
    
    if (error.message && error.message.includes('insufficient funds')) {
      logWarning(params.isExternal || false, 'Tip: Your wallet balance is insufficient. Check your balance with: rsk-cli balance');
    } else if (error.message && error.message.includes('gas')) {
      logWarning(params.isExternal || false, 'Tip: Gas estimation failed. Try with a higher gas limit or gas price.');
    } else if (error.message && error.message.includes('network')) {
      logWarning(params.isExternal || false, 'Tip: Network connection issue. Check your internet connection and try again.');
    } else if (error.message && error.message.includes('wallet')) {
      logWarning(params.isExternal || false, 'Tip: Wallet issue. Try creating a new wallet or importing an existing one.');
    } else if (error.message && error.message.includes('balance')) {
      logWarning(params.isExternal || false, 'Tip: Your wallet has insufficient balance. You need to fund your wallet first.');
      logInfo(params.isExternal || false, 'Get RBTC from: https://faucet.rootstock.io/');
    }
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
    const config = getConfig();
    const advanced = await inquirer.prompt([
      {
        type: 'input',
        name: 'gasLimit',
        message: '⛽ Enter gas limit (optional):',
        default: config.defaultGasLimit.toString()
      },
      {
        type: 'input',
        name: 'maxFeePerGas',
        message: '💰 Enter max fee per gas in RBTC (optional):',
        default: config.defaultGasPrice > 0 ? config.defaultGasPrice.toString() : ''
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
  options?: AdvancedTransactionOptions,
  params?: TransactionCommandOptions
) {
  const tokenInfo = await getTokenInfo(publicClient, tokenAddress, fromAddress);
  const defaultParams = params || { isExternal: false };
  
  logInfo(defaultParams.isExternal || false, 'Token Transfer Details:');
  logInfo(defaultParams.isExternal || false, `Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
  logInfo(defaultParams.isExternal || false, `Contract: ${tokenAddress}`);
  logInfo(defaultParams.isExternal || false, `From: ${fromAddress}`);
  logInfo(defaultParams.isExternal || false, `To: ${toAddress}`);
  logInfo(defaultParams.isExternal || false, `Amount: ${value} ${tokenInfo.symbol}`);

  const spinner = createSpinner(defaultParams.isExternal || false);
  spinner.start('⏳ Simulating token transfer...');
  
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

    spinner.succeed('Simulation successful');

    const txHash = await walletClient.writeContract(request);
    await handleTransactionReceipt(publicClient, txHash, testnet, defaultParams);
  } catch (error: any) {
    spinner.fail('Transaction failed');
    logError(defaultParams.isExternal || false, `Error details: ${error.message}`);
    
    if (error.message.includes('insufficient funds')) {
      logWarning(defaultParams.isExternal || false, 'Tip: Check your RBTC balance for gas fees.');
    } else if (error.message.includes('insufficient token balance')) {
      logWarning(defaultParams.isExternal || false, 'Tip: Check your token balance. You might not have enough tokens to transfer.');
    } else if (error.message.includes('gas')) {
      logWarning(defaultParams.isExternal || false, 'Tip: Try increasing the gas limit or gas price.');
    } else if (error.message.includes('allowance')) {
      logWarning(defaultParams.isExternal || false, 'Tip: You might need to approve the token spending first.');
    }
    
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
  options?: AdvancedTransactionOptions,
  balance?: bigint,
  params?: TransactionCommandOptions
) {
  const defaultParams = params || { isExternal: false };

  logInfo(defaultParams.isExternal || false, 'RBTC Transfer Details:');
  logInfo(defaultParams.isExternal || false, `From: ${fromAddress}`);
  logInfo(defaultParams.isExternal || false, `To: ${toAddress}`);
  logInfo(defaultParams.isExternal || false, `Amount: ${value.toFixed(18)} RBTC`);

  if (value < 0.000001) {
    logWarning(defaultParams.isExternal || false, 'Very small amount detected. This might fail due to gas costs.');
  }

  const spinner = createSpinner(defaultParams.isExternal || false);
  spinner.start('⏳ Preparing transaction...');

  try {
    const gasPrice = await publicClient.getGasPrice();
    const gasEstimate = await publicClient.estimateGas({
      account,
      to: toAddress,
      value: parseEther(value.toFixed(18)),
    });

    logInfo(defaultParams.isExternal || false, `Estimated Gas: ${gasEstimate}`);
    logInfo(defaultParams.isExternal || false, `Gas Price: ${formatEther(gasPrice)} RBTC`);

    const finalGasPrice = options?.gasPrice || gasPrice;
    const gasPriceInRBTC = formatEther(finalGasPrice);
    const gasPriceInGwei = Number(gasPriceInRBTC) * 1e9;
    
    if (gasPriceInGwei > 1000) {
      logWarning(defaultParams.isExternal || false, `Gas price is very high: ${gasPriceInGwei.toFixed(2)} gwei`);
      logWarning(defaultParams.isExternal || false, `Consider using a lower gas price for better cost efficiency`);
    }

    const totalGasCost = BigInt(gasEstimate) * finalGasPrice;
    const valueInWei = parseEther(value.toFixed(18));
    const totalCost = totalGasCost + valueInWei;
    const totalCostInRBTC = formatEther(totalCost);
    
    logInfo(defaultParams.isExternal || false, `Total Transaction Cost: ${totalCostInRBTC} RBTC`);
    logInfo(defaultParams.isExternal || false, `Gas Cost: ${formatEther(totalGasCost)} RBTC`);
    logInfo(defaultParams.isExternal || false, `Value: ${value.toFixed(18)} RBTC`);

    if (balance && totalCost > balance) {
      logError(defaultParams.isExternal || false, `Transaction cost (${totalCostInRBTC} RBTC) exceeds wallet balance (${formatEther(balance)} RBTC)`);
      logWarning(defaultParams.isExternal || false, `You need ${formatEther(totalCost - balance)} more RBTC to complete this transaction`);
      return;
    }

    const txHash = await walletClient.sendTransaction({
      account,
      to: toAddress,
      value: parseEther(value.toFixed(18)),
      gas: gasEstimate,
      gasPrice: options?.gasPrice || gasPrice,
      ...(options?.gasLimit && { gas: BigInt(options.gasLimit) }),
      ...(options?.data && { data: options.data })
    });

    spinner.succeed('Transaction sent');
    await handleTransactionReceipt(publicClient, txHash, testnet, defaultParams);
  } catch (error: any) {
    spinner.fail('Transaction failed');
    logError(defaultParams.isExternal || false, `Error details: ${error.message}`);
    
    if (error.message.includes('insufficient funds')) {
      logWarning(defaultParams.isExternal || false, 'Tip: Check your wallet balance. You need enough RBTC for the transaction amount plus gas fees.');
    } else if (error.message.includes('gas')) {
      logWarning(defaultParams.isExternal || false, 'Tip: Try increasing the gas limit or gas price.');
    } else if (error.message.includes('value')) {
      logWarning(defaultParams.isExternal || false, 'Tip: The transaction amount might be too small. Try a larger amount.');
    }
    
    throw error;
  }
}

async function handleTransactionReceipt(
  publicClient: any,
  txHash: `0x${string}`,
  testnet: boolean,
  params?: TransactionCommandOptions
) {
  const config = getConfig();
  const defaultParams = params || { isExternal: false };
  const spinner = createSpinner(defaultParams.isExternal || false);
  spinner.start('⏳ Waiting for confirmation...');
  
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    spinner.stop();

    if (receipt.status === 'success') {
      logSuccess(defaultParams.isExternal || false, 'Transaction confirmed successfully!');
      
      if (config.displayPreferences.showBlockDetails) {
        logInfo(defaultParams.isExternal || false, `Block Number: ${receipt.blockNumber}`);
      }
      
      if (config.displayPreferences.showGasDetails) {
        logInfo(defaultParams.isExternal || false, `Gas Used: ${receipt.gasUsed}`);
      }
      
      if (config.displayPreferences.showExplorerLinks) {
        const explorerUrl = testnet
          ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
          : `https://explorer.rootstock.io/tx/${txHash}`;
        logInfo(defaultParams.isExternal || false, `View on Explorer: ${explorerUrl}`);
      }

      if (config.displayPreferences.compactMode) {
        logInfo(defaultParams.isExternal || false, `Tx: ${txHash}`);
      } else {
        logInfo(defaultParams.isExternal || false, `Transaction Hash: ${txHash}`);
      }
    } else {
      logError(defaultParams.isExternal || false, 'Transaction failed');
    }
  } catch (error) {
    spinner.fail('Transaction confirmation failed');
    throw error;
  }
} 