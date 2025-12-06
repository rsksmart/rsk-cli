import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import { Address, formatEther, parseEther } from "viem";
import { loadWalletData, selectWallet, createErrorResult } from "../utils/walletLoader.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import { 
  estimateERC20Gas, 
  estimateRBTCGas, 
  createSimulationTable, 
  createValidationTable, 
  formatGasPrice 
} from "../utils/simulationUtils.js";

export interface TransactionSimulationOptions {
  testnet: boolean;
  toAddress: Address;
  value: number;
  name?: string;
  tokenAddress?: Address;
  gasLimit?: bigint;
  gasPrice?: bigint;
  data?: `0x${string}`;
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

function logInfo(message: string) {
  console.log(chalk.blue(message));
}

async function simulateERC20Transfer(
  publicClient: any,
  walletClient: any,
  tokenAddress: Address,
  recipientAddress: Address,
  transferAmount: number,
  walletAddress: Address,
  isTestnet: boolean,
  gasPrice?: bigint
): Promise<SimulationResult> {
  const isValidERC20 = await isERC20Contract(publicClient, tokenAddress);
  if (!isValidERC20) {
    return createErrorResult("The provided address is not a valid ERC20 token contract.");
  }

  const { balance: tokenBalance, decimals, name: tokenName, symbol: tokenSymbol } = 
    await getTokenInfo(publicClient, tokenAddress, walletAddress);
  
  const currentTokenBalance = Number(tokenBalance) / (10 ** decimals);
  const transferAmountBigInt = BigInt(transferAmount * (10 ** decimals));

  const rbtcBalance = await publicClient.getBalance({ address: walletAddress });
  const currentRbtcBalance = Number(formatEther(rbtcBalance));

  const gasResult = await estimateERC20Gas(
    publicClient, 
    walletClient.account, 
    tokenAddress, 
    recipientAddress, 
    transferAmountBigInt,
    gasPrice
  );

  const sufficientTokenBalance = currentTokenBalance >= transferAmount;
  const sufficientGas = currentRbtcBalance >= Number(gasResult.totalGasCostRBTC);
  const balanceAfterGas = currentRbtcBalance - Number(gasResult.totalGasCostRBTC);
  const balanceAfterTransfer = currentTokenBalance - transferAmount;
  const networkName = isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet";

  console.log("\n" + chalk.cyan("📊 SIMULATION RESULTS") + "\n");
  
  const simulationTable = createSimulationTable({
    network: networkName,
    transactionType: "ERC20 Token Transfer",
    transferAmount: `${transferAmount} ${tokenSymbol}`,
    currentBalance: `${currentTokenBalance.toFixed(6)} ${tokenSymbol}`,
    estimatedGas: gasResult.gasEstimate.toString(),
    gasPrice: formatGasPrice(gasResult.gasPrice),
    totalGasCost: `${gasResult.totalGasCostRBTC} RBTC`,
    balanceAfter: `${currentRbtcBalance.toFixed(6)} RBTC`,
    extraRows: [
      ['RBTC Balance After Gas', `${balanceAfterGas.toFixed(6)} RBTC`],
      ['Token Balance After Transfer', `${balanceAfterTransfer.toFixed(6)} ${tokenSymbol}`]
    ]
  });
  console.log(simulationTable);

  console.log("\n" + chalk.cyan("✅ VALIDATION RESULTS") + "\n");
  
  const validationTable = createValidationTable([
    {
      name: 'Sufficient Token Balance',
      passed: sufficientTokenBalance,
      details: sufficientTokenBalance ? 
        'Enough tokens for transfer' : 
        `Need ${(transferAmount - currentTokenBalance).toFixed(6)} more ${tokenSymbol}`
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
  console.log(validationTable);

  const isSuccessful = sufficientTokenBalance && sufficientGas && gasResult.simulationSucceeded;
  const summaryColor = isSuccessful ? chalk.green : chalk.red;
  const summaryMessage = isSuccessful ?
    "\n✅ Transaction simulation successful! Transaction is ready to execute." :
    "\n❌ Transaction simulation failed! Please address the issues above.";
  console.log(summaryColor(summaryMessage));

  return {
    success: true,
    data: {
      transaction: {
        from: walletAddress,
        to: recipientAddress,
        amount: `${transferAmount}`,
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
        currentBalance: currentTokenBalance.toString(),
        balanceAfterTransfer: balanceAfterTransfer.toString(),
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
  publicClient: any,
  walletClient: any,
  recipientAddress: Address,
  transferAmount: number,
  walletAddress: Address,
  isTestnet: boolean,
  gasPrice?: bigint,
  data?: `0x${string}`
): Promise<SimulationResult> {
  const rbtcBalance = await publicClient.getBalance({ address: walletAddress });
  const currentRbtcBalance = Number(formatEther(rbtcBalance));
  const transferValue = parseEther(transferAmount.toString());

  const gasResult = await estimateRBTCGas(
    publicClient,
    walletClient.account,
    recipientAddress,
    transferValue,
    data,
    gasPrice
  );

  const totalCost = transferAmount + Number(gasResult.totalGasCostRBTC);
  const sufficientBalance = currentRbtcBalance >= totalCost;
  const balanceAfterTransaction = currentRbtcBalance - totalCost;
  const networkName = isTestnet ? "Rootstock Testnet" : "Rootstock Mainnet";

  console.log("\n" + chalk.cyan("📊 SIMULATION RESULTS") + "\n");
  
  const simulationTable = createSimulationTable({
    network: networkName,
    transactionType: "RBTC Transfer",
    transferAmount: `${transferAmount} RBTC`,
    currentBalance: `${currentRbtcBalance.toFixed(6)} RBTC`,
    estimatedGas: gasResult.gasEstimate.toString(),
    gasPrice: formatGasPrice(gasResult.gasPrice),
    totalGasCost: `${gasResult.totalGasCostRBTC} RBTC`,
    balanceAfter: `${balanceAfterTransaction.toFixed(6)} RBTC`,
    extraRows: [
      ['Total Transaction Cost', `${totalCost.toFixed(6)} RBTC`]
    ]
  });
  console.log(simulationTable);

  console.log("\n" + chalk.cyan("✅ VALIDATION RESULTS") + "\n");
  
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
  console.log(validationTable);

  const isSuccessful = sufficientBalance && gasResult.simulationSucceeded;
  const summaryColor = isSuccessful ? chalk.green : chalk.red;
  const summaryMessage = isSuccessful ?
    "\n✅ Transaction simulation successful! Transaction is ready to execute." :
    "\n❌ Transaction simulation failed! Please address the issues above.";
  console.log(summaryColor(summaryMessage));

  return {
    success: true,
    data: {
      transaction: {
        from: walletAddress,
        to: recipientAddress,
        amount: `${transferAmount}`,
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
      return walletResult;
    }

    const walletSelection = selectWallet(walletResult.data, simulationOptions.name);
    if (!walletSelection.success) {
      return walletSelection;
    }

    const wallet = walletSelection.data;

    const provider = new ViemProvider(simulationOptions.testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(simulationOptions.name);

    if (!walletClient || !walletClient.account) {
      return createErrorResult("Failed to get wallet client or account.");
    }

    logInfo(`🔮 Simulating Transaction`);
    logInfo(`🔑 From Address: ${walletClient.account.address}`);
    logInfo(`🎯 To Address: ${simulationOptions.toAddress}`);
    logInfo(`💵 Amount: ${simulationOptions.value} ${simulationOptions.tokenAddress ? 'tokens' : 'RBTC'}`);

    if (simulationOptions.tokenAddress) {
      return await simulateERC20Transfer(
        publicClient,
        walletClient,
        simulationOptions.tokenAddress,
        simulationOptions.toAddress,
        simulationOptions.value,
        wallet.address,
        simulationOptions.testnet,
        simulationOptions.gasPrice
      );
    } else {
      return await simulateRBTCTransfer(
        publicClient,
        walletClient,
        simulationOptions.toAddress,
        simulationOptions.value,
        wallet.address,
        simulationOptions.testnet,
        simulationOptions.gasPrice,
        simulationOptions.data
      );
    }

  } catch (error: any) {
    const errorResult = createErrorResult(`Error during simulation: ${error.message || 'Unknown error'}`);
    console.log(chalk.red(`❌ ${errorResult.error}`));
    return errorResult;
  }
}