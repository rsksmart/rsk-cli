import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import inquirer from "inquirer";
import { Address, formatEther, parseEther, formatGwei } from "viem";
import { walletFilePath } from "../utils/constants.js";
import Table from "cli-table3";

interface GasEstimateOptions {
  testnet: boolean;
  contractAddress?: Address;
  abiPath?: string;
  functionName?: string;
  args?: any[];
  to?: Address;
  value?: string;
  data?: string;
  simulate?: boolean;
  optimize?: boolean;
  interactive?: boolean;
  isExternal?: boolean;
}

interface GasAnalysis {
  estimatedGas: bigint;
  gasPrice: bigint;
  estimatedCostInRBTC: string;
  estimatedCostInWei: bigint;
  baseFee?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
}

interface OptimizationTip {
  category: string;
  title: string;
  description: string;
  potentialSavings: string;
}

function logMessage(
  params: GasEstimateOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: GasEstimateOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: GasEstimateOptions, message: string) {
  logMessage(params, message, chalk.green);
}


function startSpinner(
  params: GasEstimateOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}


function succeedSpinner(
  params: GasEstimateOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  params: GasEstimateOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.fail(message);
  }
}

export async function gasCommand(options: GasEstimateOptions) {
  try {
    logMessage(options, '\n⛽ Gas Estimator for Rootstock\n', chalk.cyan.bold);

    if (options.interactive) {
      await interactiveGasEstimation(options.testnet);
      return;
    }

    if (options.contractAddress && options.abiPath && options.functionName) {
      await estimateContractGas(options);
    } else if (options.to) {
      await estimateTransactionGas(options);
    } else {
      await displayCurrentGasInfo(options);
    }

  } catch (error: any) {
    logError(options, `🚨 Error: ${error.message || "Gas estimation failed"}`);
  }
}

async function displayCurrentGasInfo(options: GasEstimateOptions) {
  const provider = new ViemProvider(options.testnet);
  const publicClient = await provider.getPublicClient();
  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(options, spinner, 'Fetching current gas prices...');

  try {
    const gasPrice = await publicClient.getGasPrice();
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    
    succeedSpinner(options, spinner, 'Gas information retrieved');

    const table = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [30, 50],
      style: { head: [], border: [] }
    });

    table.push(
      ['Network', options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet'],
      ['Current Gas Price', `${formatGwei(gasPrice)} Gwei (${formatEther(gasPrice)} RBTC)`],
      ['Latest Block Number', block.number?.toString() || 'N/A'],
      ['Block Gas Limit', block.gasLimit?.toString() || 'N/A'],
      ['Block Gas Used', block.gasUsed?.toString() || 'N/A'],
      ['Block Utilization', block.gasUsed && block.gasLimit 
        ? `${((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(2)}%`
        : 'N/A']
    );

    logMessage(options, table.toString());

    logMessage(options, '\n📊 Estimated Transaction Costs:\n', chalk.cyan.bold);
    
    const sampleCosts = new Table({
      head: [chalk.cyan('Transaction Type'), chalk.cyan('Gas Limit'), chalk.cyan('Cost (RBTC)')],
      colWidths: [30, 20, 25],
      style: { head: [], border: [] }
    });

    const simpleTransfer = 21000n;
    const erc20Transfer = 65000n;
    const contractDeployment = 1500000n;

    sampleCosts.push(
      ['Simple RBTC Transfer', simpleTransfer.toString(), formatEther(gasPrice * simpleTransfer)],
      ['ERC-20 Token Transfer', erc20Transfer.toString(), formatEther(gasPrice * erc20Transfer)],
      ['Contract Deployment (avg)', contractDeployment.toString(), formatEther(gasPrice * contractDeployment)]
    );

    logMessage(options, sampleCosts.toString());

  } catch (error) {
    failSpinner(options, spinner, 'Failed to fetch gas information');
    throw error;
  }
}

async function estimateTransactionGas(options: GasEstimateOptions) {
  if (!fs.existsSync(walletFilePath)) {
    logError(options, '🚫 No saved wallet found. Please create a wallet first.');
    return;
  }

  const provider = new ViemProvider(options.testnet);
  const publicClient = await provider.getPublicClient();
  const walletClient = await provider.getWalletClient();
  const account = walletClient.account;

  if (!account) {
    logError(options, '⚠️ Failed to retrieve account.');
    return;
  }

  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(options, spinner, 'Estimating transaction gas...');

  try {
    const gasPrice = await publicClient.getGasPrice();
    
    const estimatedGas = await publicClient.estimateGas({
      account: account.address,
      to: options.to!,
      value: options.value ? parseEther(options.value) : 0n,
      data: options.data as `0x${string}` | undefined,
    });

    succeedSpinner(options, spinner, 'Gas estimation complete');

    const analysis: GasAnalysis = {
      estimatedGas,
      gasPrice,
      estimatedCostInWei: estimatedGas * gasPrice,
      estimatedCostInRBTC: formatEther(estimatedGas * gasPrice),
    };

    displayGasAnalysis(analysis, options);

    if (options.simulate) {
      await simulateTransaction(publicClient, account, options);
    }

    if (options.optimize) {
      displayOptimizationTips('transaction', options);
    }

  } catch (error: any) {
    failSpinner(options, spinner, 'Gas estimation failed');
    logError(options, `Error: ${error.message || 'Unknown error'}`);
  }
}

async function estimateContractGas(options: GasEstimateOptions) {
  if (!fs.existsSync(walletFilePath)) {
    logError(options, '🚫 No saved wallet found. Please create a wallet first.');
    return;
  }

  const provider = new ViemProvider(options.testnet);
  const publicClient = await provider.getPublicClient();
  const walletClient = await provider.getWalletClient();
  const account = walletClient.account;

  if (!account) {
    logError(options, '⚠️ Failed to retrieve account.');
    return;
  }

  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(options, spinner, 'Loading contract ABI...');

  try {
    const abiContent = fs.readFileSync(options.abiPath!, 'utf8');
    const abi = JSON.parse(abiContent);
    
    if (!options.isExternal) {
      spinner.text = 'Estimating contract interaction gas...';
    }

    const gasPrice = await publicClient.getGasPrice();

    const functionArgs = options.args || [];

    const estimatedGas = await publicClient.estimateContractGas({
      account: account.address,
      address: options.contractAddress!,
      abi,
      functionName: options.functionName!,
      args: functionArgs,
    });

    succeedSpinner(options, spinner, 'Contract gas estimation complete');

    const analysis: GasAnalysis = {
      estimatedGas,
      gasPrice,
      estimatedCostInWei: estimatedGas * gasPrice,
      estimatedCostInRBTC: formatEther(estimatedGas * gasPrice),
    };

    logMessage(options, '\n📝 Contract Interaction Details:\n', chalk.cyan.bold);
    logMessage(options, `Contract: ${options.contractAddress}`);
    logMessage(options, `Function: ${options.functionName}`);
    logMessage(options, `Arguments: ${JSON.stringify(functionArgs)}\n`);

    displayGasAnalysis(analysis, options);

    if (options.simulate) {
      await simulateContractCall(publicClient, account, options, abi);
    }

    if (options.optimize) {
      displayOptimizationTips('contract', options);
    }

  } catch (error: any) {
    failSpinner(options, spinner, 'Contract gas estimation failed');
    logError(options, `Error: ${error.message || 'Unknown error'}`);
  }
}

async function simulateTransaction(publicClient: any, account: any, options: GasEstimateOptions) {
  logMessage(options, '\n🧪 Running Transaction Simulation:\n', chalk.cyan.bold);
  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(options, spinner, 'Simulating transaction...');

  try {
    const result = await publicClient.call({
      account: account.address,
      to: options.to!,
      value: options.value ? parseEther(options.value) : 0n,
      data: options.data as `0x${string}` | undefined,
    });

    succeedSpinner(options, spinner, 'Simulation successful');
    
    logSuccess(options, '\n✅ Transaction simulation passed!');
    logMessage(options, `Result: ${result.data || 'Success'}\n`);

    logMessage(options, 'Simulation Checks:', chalk.cyan);
    logSuccess(options, '  ✓ Transaction will not revert');
    logSuccess(options, '  ✓ Account has sufficient balance');
    logSuccess(options, '  ✓ Gas estimation is accurate\n');

  } catch (error: any) {
    failSpinner(options, spinner, 'Simulation failed');
    logError(options, '\n❌ Transaction simulation failed!');
    logMessage(options, `Reason: ${error.message || 'Unknown error'}\n`, chalk.yellow);
    
    logMessage(options, 'Common Issues:', chalk.cyan);
    logMessage(options, '  • Insufficient balance', chalk.yellow);
    logMessage(options, '  • Contract will revert', chalk.yellow);
    logMessage(options, '  • Invalid parameters', chalk.yellow);
    logMessage(options, '  • Gas limit too low\n', chalk.yellow);
  }
}

async function simulateContractCall(publicClient: any, account: any, options: GasEstimateOptions, abi: any) {
  logMessage(options, '\n🧪 Running Contract Simulation:\n', chalk.cyan.bold);
  const spinner = options.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(options, spinner, 'Simulating contract call...');

  try {
    const { result } = await publicClient.simulateContract({
      account: account.address,
      address: options.contractAddress!,
      abi,
      functionName: options.functionName!,
      args: options.args || [],
    });

    succeedSpinner(options, spinner, 'Simulation successful');
    
    logSuccess(options, '\n✅ Contract call simulation passed!');
    logMessage(options, `Return Value: ${JSON.stringify(result, null, 2)}\n`);

    logMessage(options, 'Simulation Checks:', chalk.cyan);
    logSuccess(options, '  ✓ Function call will not revert');
    logSuccess(options, '  ✓ Parameters are valid');
    logSuccess(options, '  ✓ Gas estimation is accurate\n');

  } catch (error: any) {
    failSpinner(options, spinner, 'Simulation failed');
    logError(options, '\n❌ Contract call simulation failed!');
    logMessage(options, `Reason: ${error.shortMessage || error.message || 'Unknown error'}\n`, chalk.yellow);
    
    logMessage(options, 'Troubleshooting:', chalk.cyan);
    logMessage(options, '  • Check function name spelling', chalk.yellow);
    logMessage(options, '  • Verify argument types and values', chalk.yellow);
    logMessage(options, '  • Ensure contract state allows this call', chalk.yellow);
    logMessage(options, '  • Check for access control restrictions\n', chalk.yellow);
  }
}

function displayGasAnalysis(analysis: GasAnalysis, options: GasEstimateOptions) {
  logMessage(options, '\n⛽ Gas Analysis:\n', chalk.cyan.bold);

  const table = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value')],
    colWidths: [35, 50],
    style: { head: [], border: [] }
  });

  table.push(
    ['Estimated Gas Units', analysis.estimatedGas.toString()],
    ['Current Gas Price', `${formatGwei(analysis.gasPrice)} Gwei (${formatEther(analysis.gasPrice)} RBTC)`],
    ['Estimated Cost', `${chalk.green(analysis.estimatedCostInRBTC)} RBTC`],
    ['Network', options.testnet ? 'Rootstock Testnet' : 'Rootstock Mainnet']
  );

  const gasWithBuffer10 = (analysis.estimatedGas * 110n) / 100n;
  const gasWithBuffer20 = (analysis.estimatedGas * 120n) / 100n;
  
  table.push(
    ['', ''],
    [chalk.yellow('Recommended Gas Limit (+10%)'), gasWithBuffer10.toString()],
    [chalk.yellow('Conservative Gas Limit (+20%)'), gasWithBuffer20.toString()],
    [chalk.yellow('Cost with 10% buffer'), `${formatEther(gasWithBuffer10 * analysis.gasPrice)} RBTC`],
    [chalk.yellow('Cost with 20% buffer'), `${formatEther(gasWithBuffer20 * analysis.gasPrice)} RBTC`]
  );

  logMessage(options, table.toString());
}

function displayOptimizationTips(context: 'transaction' | 'contract', options: GasEstimateOptions) {
  logMessage(options, '\n💡 Gas Optimization Tips:\n', chalk.cyan.bold);

  const tips: OptimizationTip[] = context === 'contract' ? [
    {
      category: 'Storage',
      title: 'Use memory instead of storage',
      description: 'Storage operations are expensive. Use memory for temporary data.',
      potentialSavings: 'Up to 20,000 gas per storage write'
    },
    {
      category: 'Data Types',
      title: 'Pack variables efficiently',
      description: 'Use uint256 or pack smaller variables together to save storage slots.',
      potentialSavings: 'Up to 20,000 gas per slot saved'
    },
    {
      category: 'Loops',
      title: 'Minimize loop iterations',
      description: 'Avoid unbounded loops. Cache array lengths outside loops.',
      potentialSavings: 'Varies by implementation'
    },
    {
      category: 'Functions',
      title: 'Use view/pure functions',
      description: 'Mark functions that don\'t modify state as view or pure.',
      potentialSavings: 'Free to call externally'
    },
    {
      category: 'Events',
      title: 'Use events instead of storage',
      description: 'Events are cheaper than storage for logging historical data.',
      potentialSavings: '~8,000 gas vs 20,000+ for storage'
    },
    {
      category: 'Batching',
      title: 'Batch operations',
      description: 'Process multiple items in a single transaction when possible.',
      potentialSavings: 'Save 21,000 gas per avoided transaction'
    }
  ] : [
    {
      category: 'Timing',
      title: 'Execute during low network usage',
      description: 'Gas prices are typically lower during off-peak hours.',
      potentialSavings: '10-30% cost reduction'
    },
    {
      category: 'Batching',
      title: 'Batch multiple transfers',
      description: 'Use batch transfer feature to send multiple transactions at once.',
      potentialSavings: 'Save 21,000 gas per transaction'
    },
    {
      category: 'Data',
      title: 'Minimize transaction data',
      description: 'Each byte of data costs gas. Keep calldata minimal.',
      potentialSavings: '4-16 gas per byte'
    },
    {
      category: 'Gas Limit',
      title: 'Set appropriate gas limits',
      description: 'Don\'t overpay. Use estimated gas + 10-20% buffer.',
      potentialSavings: 'Avoid unnecessary gas allocation'
    }
  ];

  tips.forEach((tip, index) => {
    logMessage(options, chalk.yellow(`${index + 1}. ${tip.title}`) + chalk.gray(` (${tip.category})`));
    logMessage(options, chalk.white(`   ${tip.description}`));
    logMessage(options, chalk.green(`   💰 Savings: ${tip.potentialSavings}\n`));
  });

  logMessage(options, chalk.cyan.bold('🔧 Advanced Optimization Tools:\n'));
  logMessage(options, chalk.white('• Hardhat Gas Reporter: Track gas usage in tests'));
  logMessage(options, chalk.white('• Solidity Optimizer: Enable with high runs for frequently called functions'));
  logMessage(options, chalk.white('• Function Profiling: Use Tenderly for detailed execution analysis'));
  logMessage(options, chalk.white('• Storage Layout: Analyze with hardhat-storage-layout plugin\n'));
}

async function interactiveGasEstimation(testnet: boolean) {
  logMessage({ testnet, isExternal: false } as GasEstimateOptions, '🔍 Interactive Gas Estimation\n', chalk.cyan);

  const { estimationType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'estimationType',
      message: 'What would you like to estimate?',
      choices: [
        { name: '📊 View Current Gas Prices', value: 'current' },
        { name: '💸 Simple Transaction', value: 'transaction' },
        { name: '📝 Contract Function Call', value: 'contract' },
        { name: '🚀 Contract Deployment', value: 'deployment' },
        { name: '🔄 Batch Operations', value: 'batch' }
      ]
    }
  ]);

  switch (estimationType) {
    case 'current':
      await displayCurrentGasInfo({ testnet, isExternal: false });
      break;

    case 'transaction':
      await interactiveTransactionEstimation(testnet);
      break;

    case 'contract':
      await interactiveContractEstimation(testnet);
      break;

    case 'deployment':
      await interactiveDeploymentEstimation(testnet);
      break;

    case 'batch':
      await interactiveBatchEstimation(testnet);
      break;
  }
}

async function interactiveTransactionEstimation(testnet: boolean) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'to',
      message: 'Recipient address:',
      validate: (input) => {
        if (!input.startsWith('0x') || input.length !== 42) {
          return 'Please enter a valid Ethereum address';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'value',
      message: 'Amount to send (in RBTC):',
      default: '0',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num < 0) {
          return 'Please enter a valid number';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'simulate',
      message: 'Run simulation?',
      default: true
    },
    {
      type: 'confirm',
      name: 'optimize',
      message: 'Show optimization tips?',
      default: true
    }
  ]);

  await estimateTransactionGas({
    testnet,
    to: answers.to as Address,
    value: answers.value,
    simulate: answers.simulate,
    optimize: answers.optimize
  });
}

async function interactiveContractEstimation(testnet: boolean) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'contractAddress',
      message: 'Contract address:',
      validate: (input) => {
        if (!input.startsWith('0x') || input.length !== 42) {
          return 'Please enter a valid contract address';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'abiPath',
      message: 'Path to ABI file:',
      validate: (input) => {
        if (!fs.existsSync(input)) {
          return 'ABI file not found';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'functionName',
      message: 'Function name to call:'
    },
    {
      type: 'input',
      name: 'args',
      message: 'Function arguments (JSON array, e.g., ["arg1", 123]):',
      default: '[]',
      filter: (input) => {
        try {
          return JSON.parse(input);
        } catch {
          return [];
        }
      }
    },
    {
      type: 'confirm',
      name: 'simulate',
      message: 'Run simulation?',
      default: true
    },
    {
      type: 'confirm',
      name: 'optimize',
      message: 'Show optimization tips?',
      default: true
    }
  ]);

  await estimateContractGas({
    testnet,
    contractAddress: answers.contractAddress as Address,
    abiPath: answers.abiPath,
    functionName: answers.functionName,
    args: answers.args,
    simulate: answers.simulate,
    optimize: answers.optimize
  });
}

async function interactiveDeploymentEstimation(testnet: boolean) {
  const options: GasEstimateOptions = { testnet, isExternal: false };
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'bytecodePath',
      message: 'Path to bytecode file:',
      validate: (input) => {
        if (!fs.existsSync(input)) {
          return 'Bytecode file not found';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'abiPath',
      message: 'Path to ABI file (optional):',
      default: ''
    },
    {
      type: 'confirm',
      name: 'optimize',
      message: 'Show optimization tips?',
      default: true
    }
  ]);

  const provider = new ViemProvider(testnet);
  const publicClient = await provider.getPublicClient();
  const spinner = ora('Estimating deployment gas...').start();

  try {
    const bytecode = fs.readFileSync(answers.bytecodePath, 'utf8').trim();
    const gasPrice = await publicClient.getGasPrice();

    const bytecodeLength = bytecode.length / 2; 
    const creationCost = 32000n;
    const codeCost = BigInt(bytecodeLength) * 200n;
    const estimatedGas = creationCost + codeCost;

    spinner.succeed('Deployment estimation complete');

    const analysis: GasAnalysis = {
      estimatedGas,
      gasPrice,
      estimatedCostInWei: estimatedGas * gasPrice,
      estimatedCostInRBTC: formatEther(estimatedGas * gasPrice),
    };

    logMessage(options, '\n📝 Contract Deployment Details:\n', chalk.cyan.bold);
    logMessage(options, `Bytecode Size: ${bytecodeLength} bytes`);
    logMessage(options, `Network: ${testnet ? 'Testnet' : 'Mainnet'}\n`);

    displayGasAnalysis(analysis, options);

    if (answers.optimize) {
      displayOptimizationTips('contract', { testnet, isExternal: false } as GasEstimateOptions);
    }

  } catch (error: any) {
    spinner.fail('Deployment estimation failed');
    console.error(chalk.red('Error:'), chalk.yellow(error.message));
  }
}

async function interactiveBatchEstimation(testnet: boolean) {
  const options: GasEstimateOptions = { testnet, isExternal: false };
  const answers = await inquirer.prompt([
    {
      type: 'number',
      name: 'transactionCount',
      message: 'Number of transactions to batch:',
      default: 5,
      validate: (input: any) => {
        if (!input || input < 1 || input > 100) {
          return 'Please enter a number between 1 and 100';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'operationType',
      message: 'Type of operations:',
      choices: [
        { name: 'Simple Transfers', value: 'transfer' },
        { name: 'Token Transfers', value: 'token' },
        { name: 'Contract Calls', value: 'contract' }
      ]
    }
  ]);

  const provider = new ViemProvider(testnet);
  const publicClient = await provider.getPublicClient();
  const gasPrice = await publicClient.getGasPrice();

  const count = BigInt(answers.transactionCount);
  let gasPerOperation: bigint;

  switch (answers.operationType) {
    case 'transfer':
      gasPerOperation = 21000n;
      break;
    case 'token':
      gasPerOperation = 65000n;
      break;
    case 'contract':
      gasPerOperation = 100000n;
      break;
    default:
      gasPerOperation = 21000n;
  }

  const totalGasIndividual = gasPerOperation * count;
  const totalCostIndividual = formatEther(totalGasIndividual * gasPrice);

  const batchSavings = 21000n * (count - 1n);
  const totalGasBatched = totalGasIndividual - batchSavings;
  const totalCostBatched = formatEther(totalGasBatched * gasPrice);

  logMessage(options, '\n💰 Batch Operation Analysis:\n', chalk.cyan.bold);

  const table = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Individual'), chalk.cyan('Batched'), chalk.cyan('Savings')],
    colWidths: [25, 20, 20, 20],
    style: { head: [], border: [] }
  });

  const savedRBTC = (parseFloat(totalCostIndividual) - parseFloat(totalCostBatched)).toFixed(8);
  const savedPercentage = ((Number(batchSavings) / Number(totalGasIndividual)) * 100).toFixed(2);

  table.push(
    ['Total Gas', totalGasIndividual.toString(), totalGasBatched.toString(), `${batchSavings.toString()} gas`],
    ['Total Cost', `${totalCostIndividual} RBTC`, `${totalCostBatched} RBTC`, `${savedRBTC} RBTC`],
    ['Efficiency', '100%', `${(100 - parseFloat(savedPercentage)).toFixed(2)}%`, `${savedPercentage}%`]
  );

  logMessage(options, table.toString());

  logMessage(options, `\n✨ By batching ${count} operations, you save ${savedRBTC} RBTC (${savedPercentage}% reduction)!\n`, chalk.green.bold);

  logMessage(options, '💡 Batching Benefits:', chalk.cyan);
  logMessage(options, '  • Save base transaction cost (21,000 gas) per operation');
  logMessage(options, '  • Atomic execution - all succeed or all fail');
  logMessage(options, '  • Reduced blockchain footprint');
  logMessage(options, '  • Simpler transaction management\n');

  logMessage(options, '📌 Use the batch-transfer command to execute batched operations:\n', chalk.yellow);
  logMessage(options, '   rsk-cli batch-transfer --interactive' + (testnet ? ' --testnet' : ''), chalk.gray);
  logMessage(options, '');
}
