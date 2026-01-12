import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import { Address, formatEther, parseEther, PublicClient, WalletClient } from "viem";
import { loadWalletData, selectWallet, createErrorResult } from "../utils/walletLoader.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import { 
  estimateERC20Gas, 
  estimateRBTCGas, 
  createSimulationTable, 
  createValidationTable, 
  formatGasPrice 
} from "../utils/simulationUtils.js";
import { logMessage, logError, logInfo, logWarning } from "../utils/logger.js";

export interface TransactionSimulationOptions {
  testnet: boolean;
  toAddress: Address;
  value: number;
  name?: string;
  tokenAddress?: Address;
  gasLimit?: bigint;
  gasPrice?: bigint;
  data?: `0x${string}`;
  isExternal?: boolean;
}

export interface SimulationResult {
  success: boolean;
  data?: {
    transaction: {
      from: string;
      to: string;
      amount: string;
      token: string;
      network: string;
      gasLimit: string;
      gasPrice: string;
      data?: string;
    };
    gasEstimation: {
      estimatedGas: string;
      gasPrice: string;
      totalGasCostRBTC: string;
    };
    balances: {
      currentBalance: string;
      balanceAfterTransfer: string;
      balanceAfterGas: string;
      tokenSymbol: string;
    };
    validation: {
      sufficientBalance: boolean;
      sufficientGas: boolean;
      validTransaction: boolean;
    };
  };
  error?: string;
}

async function simulateERC20Transfer(
  params: TransactionSimulationOptions,
  publicClient: PublicClient,
  walletClient: WalletClient,
  walletAddress: Address
): Promise<SimulationResult> {
  const { tokenAddress, toAddress, value, gasPrice } = params;

  if (!tokenAddress) {
    return createErrorResult("Token address is required for ERC20 transfer.");
  }

  const isValidERC20 = await isERC20Contract(publicClient, tokenAddress);
  if (!isValidERC20) {
    return createErrorResult("The provided address is not a valid ERC20 token contract.");
  }

  const { balance: tokenBalance, decimals, symbol: tokenSymbol } =
    await getTokenInfo(publicClient, tokenAddress, walletAddress);

  const decimalsBigInt = BigInt(10 ** decimals);
  const currentTokenBalance = tokenBalance / decimalsBigInt;
  const transferAmountBigInt = BigInt(value) * decimalsBigInt;

  if (!walletClient.account) {
    return createErrorResult("Wallet client account is not available.");
  }

  const rbtcBalance = await publicClient.getBalance({ address: walletAddress });
  const currentRbtcBalance = Number(formatEther(rbtcBalance));

  const gasResult = await estimateERC20Gas(
    publicClient,
    walletClient.account,
    tokenAddress,
    toAddress,
    transferAmountBigInt,
    gasPrice
  );

  if (gasResult.usedFallback) {
    logWarning(params.isExternal || false, `⚠️  Gas estimation failed. Using fallback value of ${gasResult.gasEstimate.toString()} gas units. Actual gas cost may differ.`);
  }

  const valueBigInt = BigInt(value);
  const sufficientTokenBalance = currentTokenBalance >= valueBigInt;
  const sufficientGas = currentRbtcBalance >= Number(gasResult.totalGasCostRBTC);
  const balanceAfterGas = currentRbtcBalance - Number(gasResult.totalGasCostRBTC);
  const balanceAfterTransfer = currentTokenBalance - valueBigInt;
  const networkName = params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet";

  logMessage(params.isExternal || false, "\n" + chalk.cyan("📊 SIMULATION RESULTS") + "\n");

  const simulationTable = createSimulationTable({
    network: networkName,
    transactionType: "ERC20 Token Transfer",
    transferAmount: `${value} ${tokenSymbol}`,
    currentBalance: `${(Number(currentTokenBalance) / Number(decimalsBigInt)).toFixed(6)} ${tokenSymbol}`,
    estimatedGas: gasResult.gasEstimate.toString(),
    gasPrice: formatGasPrice(gasResult.gasPrice),
    totalGasCost: `${gasResult.totalGasCostRBTC} RBTC`,
    balanceAfter: `${currentRbtcBalance.toFixed(6)} RBTC`,
    extraRows: [
      ['RBTC Balance After Gas', `${balanceAfterGas.toFixed(6)} RBTC`],
      ['Token Balance After Transfer', `${(Number(balanceAfterTransfer) / Number(decimalsBigInt)).toFixed(6)} ${tokenSymbol}`]
    ]
  });
  logMessage(params.isExternal || false, simulationTable);

  logMessage(params.isExternal || false, "\n" + chalk.cyan("✅ VALIDATION RESULTS") + "\n");

  const validationTable = createValidationTable([
    {
      name: 'Sufficient Token Balance',
      passed: sufficientTokenBalance,
      details: sufficientTokenBalance ?
        'Enough tokens for transfer' :
        `Need ${(Number(valueBigInt - currentTokenBalance) / Number(decimalsBigInt)).toFixed(6)} more ${tokenSymbol}`
    },
    {
      name: 'Sufficient Gas Balance',
      passed: sufficientGas,
      details: sufficientGas ?
        'Enough RBTC for gas' :
        `Need ${(Number(gasResult.totalGasCostRBTC) - currentRbtcBalance).toFixed(6)} more RBTC`
    },
    {
      name: 'Transaction Validity',
      passed: gasResult.simulationSucceeded,
      details: gasResult.simulationSucceeded ?
        'Transaction simulation successful' :
        'Transaction would fail'
    }
  ]);
  logMessage(params.isExternal || false, validationTable);

  const isSuccessful = sufficientTokenBalance && sufficientGas && gasResult.simulationSucceeded;
  const summaryMessage = isSuccessful ?
    "\n✅ Transaction simulation successful! Transaction is ready to execute." :
    "\n❌ Transaction simulation failed! Please address the issues above.";
  logMessage(params.isExternal || false, summaryMessage, isSuccessful ? chalk.green : chalk.red);

  return {
    success: isSuccessful,
    data: {
      transaction: {
        from: walletAddress,
        to: toAddress,
        amount: `${value}`,
        token: tokenSymbol,
        network: networkName,
        gasLimit: gasResult.gasEstimate.toString(),
        gasPrice: gasResult.gasPrice.toString()
      },
      gasEstimation: {
        estimatedGas: gasResult.gasEstimate.toString(),
        gasPrice: formatEther(gasResult.gasPrice),
        totalGasCostRBTC: gasResult.totalGasCostRBTC,
      },
      balances: {
        currentBalance: (Number(currentTokenBalance) / Number(decimalsBigInt)).toString(),
        balanceAfterTransfer: (Number(balanceAfterTransfer) / Number(decimalsBigInt)).toString(),
        balanceAfterGas: balanceAfterGas.toString(),
        tokenSymbol: tokenSymbol,
      },
      validation: {
        sufficientBalance: sufficientTokenBalance,
        sufficientGas: sufficientGas,
        validTransaction: gasResult.simulationSucceeded,
      },
    },
  };
}

async function simulateRBTCTransfer(
  params: TransactionSimulationOptions,
  publicClient: PublicClient,
  walletClient: WalletClient,
  walletAddress: Address
): Promise<SimulationResult> {
  const { toAddress, value, gasPrice, data } = params;

  if (!walletClient.account) {
    return createErrorResult("Wallet client account is not available.");
  }

  const rbtcBalance = await publicClient.getBalance({ address: walletAddress });
  const currentRbtcBalance = Number(formatEther(rbtcBalance));
  const transferValue = parseEther(value.toString());

  const gasResult = await estimateRBTCGas(
    publicClient,
    walletClient.account,
    toAddress,
    transferValue,
    data,
    gasPrice
  );

  if (gasResult.usedFallback) {
    logWarning(params.isExternal || false, `⚠️  Gas estimation failed. Using fallback value of ${gasResult.gasEstimate.toString()} gas units. Actual gas cost may differ.`);
  }

  const totalCost = value + Number(gasResult.totalGasCostRBTC);
  const sufficientBalance = currentRbtcBalance >= totalCost;
  const balanceAfterTransaction = currentRbtcBalance - totalCost;
  const networkName = params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet";

  logMessage(params.isExternal || false, "\n" + chalk.cyan("📊 SIMULATION RESULTS") + "\n");

  const simulationTable = createSimulationTable({
    network: networkName,
    transactionType: "RBTC Transfer",
    transferAmount: `${value} RBTC`,
    currentBalance: `${currentRbtcBalance.toFixed(6)} RBTC`,
    estimatedGas: gasResult.gasEstimate.toString(),
    gasPrice: formatGasPrice(gasResult.gasPrice),
    totalGasCost: `${gasResult.totalGasCostRBTC} RBTC`,
    balanceAfter: `${balanceAfterTransaction.toFixed(6)} RBTC`,
    extraRows: [
      ['Total Transaction Cost', `${totalCost.toFixed(6)} RBTC`]
    ]
  });
  logMessage(params.isExternal || false, simulationTable);

  logMessage(params.isExternal || false, "\n" + chalk.cyan("✅ VALIDATION RESULTS") + "\n");

  const validationTable = createValidationTable([
    {
      name: 'Sufficient Balance',
      passed: sufficientBalance,
      details: sufficientBalance ?
        'Enough RBTC for transfer + gas' :
        `Need ${(totalCost - currentRbtcBalance).toFixed(6)} more RBTC`
    },
    {
      name: 'Transaction Validity',
      passed: gasResult.simulationSucceeded,
      details: gasResult.simulationSucceeded ?
        'Transaction simulation successful' :
        'Transaction would fail'
    }
  ]);
  logMessage(params.isExternal || false, validationTable);

  const isSuccessful = sufficientBalance && gasResult.simulationSucceeded;
  const summaryMessage = isSuccessful ?
    "\n✅ Transaction simulation successful! Transaction is ready to execute." :
    "\n❌ Transaction simulation failed! Please address the issues above.";
  logMessage(params.isExternal || false, summaryMessage, isSuccessful ? chalk.green : chalk.red);

  return {
    success: isSuccessful,
    data: {
      transaction: {
        from: walletAddress,
        to: toAddress,
        amount: `${value}`,
        token: "RBTC",
        network: networkName,
        gasLimit: gasResult.gasEstimate.toString(),
        gasPrice: gasResult.gasPrice.toString(),
        data
      },
      gasEstimation: {
        estimatedGas: gasResult.gasEstimate.toString(),
        gasPrice: formatEther(gasResult.gasPrice),
        totalGasCostRBTC: gasResult.totalGasCostRBTC,
      },
      balances: {
        currentBalance: currentRbtcBalance.toString(),
        balanceAfterTransfer: balanceAfterTransaction.toString(),
        balanceAfterGas: balanceAfterTransaction.toString(),
        tokenSymbol: "RBTC",
      },
      validation: {
        sufficientBalance: sufficientBalance,
        sufficientGas: sufficientBalance,
        validTransaction: gasResult.simulationSucceeded,
      },
    },
  };
}

export async function simulateCommand(
  simulationOptions: TransactionSimulationOptions
): Promise<SimulationResult | void> {
  try {
    const walletResult = loadWalletData();
    if (!walletResult.success) {
      logError(simulationOptions.isExternal || false, walletResult.error);
      return walletResult;
    }

    const walletSelection = selectWallet(walletResult.data, simulationOptions.name);
    if (!walletSelection.success) {
      logError(simulationOptions.isExternal || false, walletSelection.error);
      return walletSelection;
    }

    const wallet = walletSelection.data;

    const provider = new ViemProvider(simulationOptions.testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(simulationOptions.name);

    if (!walletClient || !walletClient.account) {
      const errorResult = createErrorResult("Failed to get wallet client or account.");
      logError(simulationOptions.isExternal || false, errorResult.error);
      return errorResult;
    }

    logInfo(simulationOptions.isExternal || false, `🔮 Simulating Transaction`);
    logInfo(simulationOptions.isExternal || false, `🔑 From Address: ${walletClient.account.address}`);
    logInfo(simulationOptions.isExternal || false, `🎯 To Address: ${simulationOptions.toAddress}`);
    logInfo(simulationOptions.isExternal || false, `💵 Amount: ${simulationOptions.value} ${simulationOptions.tokenAddress ? 'tokens' : 'RBTC'}`);

    if (simulationOptions.tokenAddress) {
      return await simulateERC20Transfer(
        simulationOptions,
        publicClient,
        walletClient,
        wallet.address
      );
    } else {
      return await simulateRBTCTransfer(
        simulationOptions,
        publicClient,
        walletClient,
        wallet.address
      );
    }

  } catch (error: any) {
    const errorResult = createErrorResult(`Error during simulation: ${error.message || 'Unknown error'}`);
    logError(simulationOptions.isExternal || false, errorResult.error || 'Unknown error');
    return errorResult;
  }
}