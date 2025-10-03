import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import { Address, parseEther, formatEther } from "viem";
import { walletFilePath } from "../utils/constants.js";
import { getTokenInfo, isERC20Contract } from "../utils/tokenHelper.js";
import { SimulationOptions, SimulationResult, SimulationData } from "../utils/types.js";

export async function simulateCommand(options: SimulationOptions): Promise<SimulationResult> {
  try {
    if (!fs.existsSync(walletFilePath)) {
      console.log(chalk.red("🚫 No saved wallet found. Please create a wallet first."));
      return { success: false, error: "No wallet found" };
    }

    const walletsData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    if (!walletsData.currentWallet || !walletsData.wallets) {
      console.log(chalk.red("⚠️ No valid wallet found. Please create or import a wallet first."));
      return { success: false, error: "No valid wallet found" };
    }

    const { currentWallet, wallets } = walletsData;
    let wallet = options.name ? wallets[options.name] : wallets[currentWallet];
    if (!wallet) {
      console.log(chalk.red("⚠️ Wallet not found."));
      return { success: false, error: "Wallet not found" };
    }

    const provider = new ViemProvider(options.testnet);
    const publicClient = await provider.getPublicClient();
    const walletClient = await provider.getWalletClient(options.name);
    const account = walletClient.account;

    if (!account) {
      console.log(chalk.red("⚠️ Failed to retrieve the account."));
      return { success: false, error: "Failed to retrieve account" };
    }

    console.log(chalk.blue("🔍 Starting transaction simulation..."));
    console.log(chalk.white(`📄 From: ${wallet.address}`));
    console.log(chalk.white(`🎯 To: ${options.toAddress}`));
    console.log(chalk.white(`💰 Amount: ${options.value}`));
    console.log(chalk.white(`🌐 Network: ${options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'}`));

    const spinner = ora('⏳ Simulating transaction...').start();

    try {
      let simulationData: SimulationData;

      if (options.tokenAddress) {
        // ERC20 Token Transfer Simulation
        simulationData = await simulateTokenTransfer(
          publicClient,
          account,
          options.tokenAddress,
          options.toAddress,
          options.value,
          wallet.address,
          options.testnet,
          options.txOptions
        );
      } else {
        // RBTC Transfer Simulation
        simulationData = await simulateRBTCTransfer(
          publicClient,
          account,
          options.toAddress,
          options.value,
          wallet.address,
          options.testnet,
          options.txOptions
        );
      }

      spinner.succeed('✅ Simulation completed successfully!');
      
      // Display simulation results
      displaySimulationResults(simulationData);

      return { success: true, data: simulationData };
    } catch (error: any) {
      spinner.fail('❌ Simulation failed');
      console.log(chalk.red(`🚨 Simulation Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  } catch (error: any) {
    console.error(chalk.red("🚨 Error during simulation:"), error.message || error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

async function simulateTokenTransfer(
  publicClient: any,
  account: any,
  tokenAddress: Address,
  toAddress: Address,
  value: number,
  fromAddress: Address,
  testnet: boolean,
  txOptions?: any
): Promise<SimulationData> {
  // Get token information
  const tokenInfo = await getTokenInfo(publicClient, tokenAddress, fromAddress);
  
  console.log(chalk.white(`\n📄 Token Information:`));
  console.log(chalk.white(`   Name: ${tokenInfo.name}`));
  console.log(chalk.white(`   Symbol: ${tokenInfo.symbol}`));
  console.log(chalk.white(`   Contract: ${tokenAddress}`));
  console.log(chalk.white(`   Amount: ${value} ${tokenInfo.symbol}`));

  // Simulate the token transfer
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
    ...txOptions
  });

  // Get current gas price
  const gasPrice = await publicClient.getGasPrice();
  const gasEstimate = request.gas || BigInt(65000); // Default for ERC20 transfers

  return {
    from: fromAddress,
    to: toAddress,
    value: `${value} ${tokenInfo.symbol}`,
    gasEstimate: gasEstimate.toString(),
    gasPrice: formatEther(gasPrice),
    totalCost: formatEther(BigInt(gasPrice) * gasEstimate),
    network: testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet',
    tokenInfo: {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      decimals: tokenInfo.decimals,
      contract: tokenAddress
    },
    simulationDetails: {
      blockNumber: (await publicClient.getBlockNumber()).toString(),
      timestamp: new Date().toISOString(),
      nonce: Number(await publicClient.getTransactionCount({ address: fromAddress })),
      chainId: testnet ? 31 : 30
    }
  };
}

async function simulateRBTCTransfer(
  publicClient: any,
  account: any,
  toAddress: Address,
  value: number,
  fromAddress: Address,
  testnet: boolean,
  txOptions?: any
): Promise<SimulationData> {
  console.log(chalk.white(`\n📄 RBTC Transfer:`));
  console.log(chalk.white(`   Amount: ${value} RBTC`));

  // Simulate the RBTC transfer by estimating gas
  const gasEstimate = await publicClient.estimateGas({
    account,
    to: toAddress,
    value: parseEther(value.toString()),
    ...txOptions
  });

  // Get current gas price
  const gasPrice = await publicClient.getGasPrice();

  return {
    from: fromAddress,
    to: toAddress,
    value: `${value} RBTC`,
    gasEstimate: gasEstimate.toString(),
    gasPrice: formatEther(gasPrice),
    totalCost: formatEther(BigInt(gasPrice) * gasEstimate),
    network: testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet',
    simulationDetails: {
      blockNumber: (await publicClient.getBlockNumber()).toString(),
      timestamp: new Date().toISOString(),
      nonce: Number(await publicClient.getTransactionCount({ address: fromAddress })),
      chainId: testnet ? 31 : 30
    }
  };
}

function displaySimulationResults(data: SimulationData) {
  console.log(chalk.green('\n📊 Simulation Results:'));
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  
  console.log(chalk.cyan('📄 Transaction Details:'));
  console.log(chalk.white(`   From: ${data.from}`));
  console.log(chalk.white(`   To: ${data.to}`));
  console.log(chalk.white(`   Value: ${data.value}`));
  console.log(chalk.white(`   Network: ${data.network}`));
  
  if (data.tokenInfo) {
    console.log(chalk.cyan('\n🪙 Token Information:'));
    console.log(chalk.white(`   Name: ${data.tokenInfo.name}`));
    console.log(chalk.white(`   Symbol: ${data.tokenInfo.symbol}`));
    console.log(chalk.white(`   Contract: ${data.tokenInfo.contract}`));
  }
  
  console.log(chalk.cyan('\n⛽ Gas Information:'));
  console.log(chalk.white(`   Gas Estimate: ${data.gasEstimate}`));
  console.log(chalk.white(`   Gas Price: ${data.gasPrice} RBTC`));
  console.log(chalk.white(`   Total Gas Cost: ${data.totalCost} RBTC`));
  
  console.log(chalk.cyan('\n🔍 Simulation Details:'));
  console.log(chalk.white(`   Block Number: ${data.simulationDetails.blockNumber}`));
  console.log(chalk.white(`   Timestamp: ${data.simulationDetails.timestamp}`));
  console.log(chalk.white(`   Nonce: ${data.simulationDetails.nonce}`));
  console.log(chalk.white(`   Chain ID: ${data.simulationDetails.chainId}`));
  
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.green('✅ This transaction would succeed if executed.'));
  console.log(chalk.yellow('💡 Use the actual transfer command to execute this transaction.'));
}
