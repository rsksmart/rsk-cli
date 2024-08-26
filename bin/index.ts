#!/usr/bin/env node
import { Command } from 'commander';
import { walletCommand } from '../src/commands/wallet.js';
import { balanceCommand } from '../src/commands/balance.js';
import { transferCommand } from '../src/commands/transfer.js';
import { txCommand } from '../src/commands/tx.js';
import figlet from 'figlet';
import chalk from 'chalk';
import { deployCommand } from '../src/commands/deploy.js';

interface CommandOptions {
  testnet?: boolean;
  address?: string;
  value?: string;
  txid?: string;
  abi?: string;          
  bytecode?: string;      
  constructorArgs?: any;
}

const orange = chalk.rgb(255, 165, 0);

console.log(
  orange(
    figlet.textSync('Rootstock', {
      font: '3D-ASCII',
      horizontalLayout: 'fitted',
      verticalLayout: 'fitted',
    })
  )
);

const program = new Command();

program
  .name('rsk-cli')
  .description('CLI tool for interacting with Rootstock blockchain')
  .version('0.0.');

program
  .command('wallet')
  .description('Manage your wallet: create a new one, use an existing wallet, or import a custom wallet')
  .action(async () => {
    await walletCommand();
  });

program
  .command('balance')
  .description('Check the balance of the saved wallet')
  .option('-t, --testnet', 'Check the balance on the testnet')
  .action(async (options: CommandOptions) => {
    await balanceCommand(!!options.testnet); 
  });

program
  .command('transfer')
  .description('Transfer rBTC to the provided address')
  .option('-t, --testnet', 'Transfer on the testnet')
  .requiredOption('-a, --address <address>', 'Recipient address')
  .requiredOption('-v, --value <value>', 'Amount to transfer in rBTC')
  .action(async (options: CommandOptions) => {
    try {
      await transferCommand(!!options.testnet, `0x${options.address!}`, parseFloat(options.value!));
    } catch (error) {
      console.error(chalk.red('Error during transfer:'), error);
    }
  });

program
  .command('tx')
  .description('Check the status of a transaction')
  .option('-t, --testnet', 'Check the transaction status on the testnet')
  .requiredOption('-i, --txid <txid>', 'Transaction ID')
  .action(async (options: CommandOptions) => {
    const formattedTxId = options.txid!.startsWith('0x')
      ? options.txid
      : `0x${options.txid}`;
    
    await txCommand(!!options.testnet, formattedTxId as `0x${string}`);
  });

program
.command('deploy')
.description('Deploy a contract')
.requiredOption('--abi <path>', 'Path to the ABI file')
.requiredOption('--bytecode <path>', 'Path to the bytecode file')
.option('--constructorArgs <args>', 'JSON string of constructor arguments')
.option('-t, --testnet', 'Deploy on the testnet')
.action(async (options: CommandOptions) => {
  const constructorArgs = options.constructorArgs ? JSON.parse(options.constructorArgs) : [];
  await deployCommand(options.abi!, options.bytecode!, !!options.testnet, constructorArgs);
});

program.parse(process.argv);
