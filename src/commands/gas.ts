import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import { GasOptions, GasResult, GasPriceInfo, GasEstimate } from "../utils/types.js";
import { formatEther, parseEther } from "viem";

export async function gasCommand(options: GasOptions): Promise<GasResult> {
  try {
    const provider = new ViemProvider(options.testnet);
    const publicClient = await provider.getPublicClient();

    console.log(chalk.blue("⛽ Fetching current gas prices..."));
    console.log(chalk.white(`🌐 Network: ${options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'}`));

    const spinner = ora('⏳ Getting gas price data...').start();

    try {
      // Get current gas price and block information
      const [gasPrice, blockNumber] = await Promise.all([
        publicClient.getGasPrice(),
        publicClient.getBlockNumber()
      ]);

      spinner.succeed('✅ Gas price data retrieved');

      // Calculate different gas price tiers
      const gasPrices = calculateGasPriceTiers(gasPrice);
      
      // Get gas estimates if requested
      let estimates: GasEstimate[] = [];
      if (options.estimate) {
        estimates = await getGasEstimates(publicClient, gasPrices);
      }

      // Get recommendation
      const recommendation = getGasRecommendation(gasPrices, options.speed);

      // Display results
      displayGasInfo(gasPrices, estimates, recommendation, options, blockNumber.toString());

      return {
        success: true,
        data: {
          gasPrices,
          estimates: options.estimate ? estimates : undefined,
          network: options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet',
          blockNumber: blockNumber.toString(),
          recommendation
        }
      };

    } catch (error: any) {
      spinner.fail('❌ Failed to get gas price data');
      throw error;
    }

  } catch (error: any) {
    console.error(chalk.red("🚨 Error getting gas information:"), error.message || error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

function calculateGasPriceTiers(currentGasPrice: bigint): GasPriceInfo {
  const currentPriceWei = currentGasPrice;
  const currentPriceEther = formatEther(currentPriceWei);
  
  // Calculate different tiers based on current price
  const slowPrice = currentPriceWei * BigInt(80) / BigInt(100); // 80% of current
  const standardPrice = currentPriceWei; // Current price
  const fastPrice = currentPriceWei * BigInt(120) / BigInt(100); // 120% of current

  return {
    slow: {
      price: formatEther(slowPrice),
      time: "2-5 min",
      gwei: formatGwei(slowPrice)
    },
    standard: {
      price: formatEther(standardPrice),
      time: "30-60 sec",
      gwei: formatGwei(standardPrice)
    },
    fast: {
      price: formatEther(fastPrice),
      time: "10-30 sec",
      gwei: formatGwei(fastPrice)
    }
  };
}

function formatGwei(priceWei: bigint): string {
  // Convert wei to gwei (1 gwei = 10^9 wei)
  const gwei = Number(priceWei) / 1e9;
  return gwei.toFixed(2);
}

async function getGasEstimates(publicClient: any, gasPrices: GasPriceInfo): Promise<GasEstimate[]> {
  const estimates: GasEstimate[] = [];

  // Simple RBTC transfer estimate
  const simpleTransferGas = BigInt(21000);
  estimates.push({
    transactionType: "Simple RBTC Transfer",
    gasLimit: simpleTransferGas.toString(),
    estimatedCost: formatEther(parseEther(gasPrices.standard.price) * simpleTransferGas),
    recommendation: "Standard gas price recommended"
  });

  // ERC20 token transfer estimate
  const tokenTransferGas = BigInt(65000);
  estimates.push({
    transactionType: "ERC20 Token Transfer",
    gasLimit: tokenTransferGas.toString(),
    estimatedCost: formatEther(parseEther(gasPrices.standard.price) * tokenTransferGas),
    recommendation: "Standard gas price recommended"
  });

  // Contract interaction estimate
  const contractInteractionGas = BigInt(100000);
  estimates.push({
    transactionType: "Contract Interaction",
    gasLimit: contractInteractionGas.toString(),
    estimatedCost: formatEther(parseEther(gasPrices.standard.price) * contractInteractionGas),
    recommendation: "Standard gas price recommended"
  });

  return estimates;
}

function getGasRecommendation(gasPrices: GasPriceInfo, preferredSpeed?: string): string {
  if (preferredSpeed) {
    switch (preferredSpeed) {
      case 'slow':
        return `Use slow gas price (${gasPrices.slow.price} RBTC) for cost savings`;
      case 'fast':
        return `Use fast gas price (${gasPrices.fast.price} RBTC) for quick confirmation`;
      case 'standard':
        return `Use standard gas price (${gasPrices.standard.price} RBTC) for balanced speed and cost`;
      default:
        return `Use standard gas price (${gasPrices.standard.price} RBTC) for most transactions`;
    }
  }
  
  return `Use standard gas price (${gasPrices.standard.price} RBTC) for most transactions`;
}

function displayGasInfo(
  gasPrices: GasPriceInfo, 
  estimates: GasEstimate[], 
  recommendation: string, 
  options: GasOptions, 
  blockNumber: string
) {
  console.log(chalk.green('\n⛽ Current Gas Prices:'));
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  
  console.log(chalk.cyan('🌐 Network Information:'));
  console.log(chalk.white(`   Network: ${options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'}`));
  console.log(chalk.white(`   Block Number: ${blockNumber}`));
  
  console.log(chalk.cyan('\n💰 Gas Price Tiers:'));
  console.log(chalk.white(`   🐌 Slow:    ${gasPrices.slow.price} RBTC (${gasPrices.slow.gwei} gwei) - ${gasPrices.slow.time}`));
  console.log(chalk.white(`   🚀 Standard: ${gasPrices.standard.price} RBTC (${gasPrices.standard.gwei} gwei) - ${gasPrices.standard.time}`));
  console.log(chalk.white(`   ⚡ Fast:     ${gasPrices.fast.price} RBTC (${gasPrices.fast.gwei} gwei) - ${gasPrices.fast.time}`));
  
  if (options.estimate && estimates.length > 0) {
    console.log(chalk.cyan('\n📊 Gas Cost Estimates:'));
    estimates.forEach((estimate, index) => {
      console.log(chalk.white(`   ${index + 1}. ${estimate.transactionType}`));
      console.log(chalk.white(`      Gas Limit: ${estimate.gasLimit}`));
      console.log(chalk.white(`      Estimated Cost: ${estimate.estimatedCost} RBTC`));
      console.log(chalk.white(`      Recommendation: ${estimate.recommendation}`));
    });
  }
  
  console.log(chalk.cyan('\n💡 Recommendation:'));
  console.log(chalk.yellow(`   ${recommendation}`));
  
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.blue('💡 Tips:'));
  console.log(chalk.white('   • Use slow gas for non-urgent transactions to save money'));
  console.log(chalk.white('   • Use standard gas for most transactions (recommended)'));
  console.log(chalk.white('   • Use fast gas only when you need quick confirmation'));
  console.log(chalk.white('   • Use --estimate flag to see cost estimates for different transaction types'));
}
