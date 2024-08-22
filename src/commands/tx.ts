import ViemProvider from '../utils/viemProvider.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export async function txCommand(testnet: boolean, txid: string): Promise<void> {
  try {
    const formattedTxId = txid.startsWith('0x') ? txid : `0x${txid}`;
    const txidWithCorrectType = formattedTxId as `0x${string}`;
    // Step 1: Determine the network and create the public client using ViemProvider
    const network = testnet ? 'rootstockTestnet' : 'rootstock';
    const provider = new ViemProvider(network); // Instantiate the ViemProvider class
    const client = await provider.getPublicClient(); // Get the public client
    
    // Step 2: Fetch the transaction receipt
    const txReceipt = await client.getTransactionReceipt({ hash: txidWithCorrectType });
    if (!txReceipt) {
      console.log(chalk.red('⚠️ Transaction not found. Please check the transaction ID and try again.'));
      return;
    }
    // Step 3: Output the transaction details in a table
    const table = new Table({
      head: ['🔍', 'Details'],
      colWidths: [20, 68], 
    });
    table.push(
      { '🔑 Tx ID': txidWithCorrectType },
      { '🔗 Block Hash': txReceipt.blockHash },
      { '🧱 Block No.': txReceipt.blockNumber.toString() },
      { '⛽ Gas Used': txReceipt.gasUsed.toString() },
      { '✅ Status': txReceipt.status ? 'Success' : 'Failed' },
      { '📤 From': txReceipt.from },
      { '📥 To': txReceipt.to }
    );
    console.log(table.toString());
  } catch (error) {
    // Handle the error safely by checking its type
    if (error instanceof Error) {
      console.error(chalk.red('🚨 Error checking transaction status:'), chalk.yellow(error.message));
    } else {
      console.error(chalk.red('🚨 An unknown error occurred.'));
    }
  }
}
