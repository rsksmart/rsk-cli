import { PublicClient, Account, Address, parseEther, formatEther } from "viem";
import chalk from "chalk";
import Table from "cli-table3";

export const ERC20_TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" }
  ],
  outputs: [{ type: "bool" }]
}] as const;

export interface GasEstimationResult {
  gasEstimate: bigint;
  gasPrice: bigint;
  totalGasCostRBTC: string;
  simulationSucceeded: boolean;
  errorMessage?: string;
}

export async function estimateERC20Gas(
  publicClient: PublicClient,
  account: Account,
  tokenAddress: Address,
  recipientAddress: Address,
  amount: bigint,
  gasPrice?: bigint
): Promise<GasEstimationResult> {
  let gasEstimate = BigInt(100000);
  let simulationSucceeded = true;
  let errorMessage: string | undefined;

  try {
    await publicClient.simulateContract({
      account,
      address: tokenAddress,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [recipientAddress, amount]
    });

    gasEstimate = await publicClient.estimateContractGas({
      account,
      address: tokenAddress,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [recipientAddress, amount]
    });
  } catch (error: any) {
    simulationSucceeded = false;
    errorMessage = error.message || 'Unknown error';
  }

  const currentGasPrice = gasPrice || await publicClient.getGasPrice();
  const totalGasCost = gasEstimate * currentGasPrice;

  return {
    gasEstimate,
    gasPrice: currentGasPrice,
    totalGasCostRBTC: formatEther(totalGasCost),
    simulationSucceeded,
    errorMessage
  };
}

export async function estimateRBTCGas(
  publicClient: PublicClient,
  account: Account,
  recipientAddress: Address,
  value: bigint,
  data?: `0x${string}`,
  gasPrice?: bigint
): Promise<GasEstimationResult> {
  let gasEstimate = BigInt(21000);
  let simulationSucceeded = true;
  let errorMessage: string | undefined;

  try {
    gasEstimate = await publicClient.estimateGas({
      account,
      to: recipientAddress,
      value,
      ...(data && { data })
    });
  } catch (error: any) {
    simulationSucceeded = false;
    errorMessage = error.message || 'Unknown error';
  }

  const currentGasPrice = gasPrice || await publicClient.getGasPrice();
  const totalGasCost = gasEstimate * currentGasPrice;

  return {
    gasEstimate,
    gasPrice: currentGasPrice,
    totalGasCostRBTC: formatEther(totalGasCost),
    simulationSucceeded,
    errorMessage
  };
}

export function createSimulationTable(data: {
  network: string;
  transactionType: string;
  transferAmount: string;
  currentBalance: string;
  estimatedGas: string;
  gasPrice: string;
  totalGasCost: string;
  balanceAfter: string;
  extraRows?: [string, string][];
}): string {
  const table = new Table({
    head: ['Parameter', 'Value'],
    colWidths: [30, 50]
  });

  const rows: [string, string][] = [
    ['Network', data.network],
    ['Transaction Type', data.transactionType],
    ['Transfer Amount', data.transferAmount],
    ['Current Balance', data.currentBalance],
    ['Estimated Gas', data.estimatedGas],
    ['Gas Price', data.gasPrice],
    ['Total Gas Cost', data.totalGasCost],
    ['Balance After Transaction', data.balanceAfter]
  ];

  if (data.extraRows) {
    rows.push(...data.extraRows);
  }

  table.push(...rows);
  return table.toString();
}

export function createValidationTable(checks: {
  name: string;
  passed: boolean;
  details: string;
}[]): string {
  const table = new Table({
    head: ['Check', 'Status', 'Details'],
    colWidths: [25, 15, 35]
  });

  const rows = checks.map(check => [
    check.name,
    check.passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL'),
    check.details
  ]);

  table.push(...rows);
  return table.toString();
}

export function formatGasPrice(gasPrice: bigint): string {
  return `${formatEther(gasPrice)} RBTC (${gasPrice.toString()} wei)`;
}