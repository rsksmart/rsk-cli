#!/usr/bin/env node

import { Command } from 'commander';
import { createWalletCommand } from '../src/commands/createWallet.js';
import { balanceCommand } from '../src/commands/balance.js';
import { transferCommand } from '../src/commands/transfer.js';
import figlet from 'figlet';
import chalk from 'chalk';

// Define a custom orange color
const orange = chalk.rgb(255, 165, 0);

console.log(
  orange(
    figlet.textSync('Rootstock', {
      font: '3D-ASCII', // [4Max,Bright,3D-ASCII]
      horizontalLayout: 'fitted', // [full,full, fitted]
      verticalLayout: 'fitted', // [full,full, fitted]
    })
  )
);

// Initialize the program with Commander
const program = new Command();

// Configure the CLI
program
  .name('rsk-cli')
  .description('CLI tool for interacting with Rootstock blockchain')
  .version('1.0.0');

// Add the create wallet command
program
  .command('createWallet')
  .description('Create a new wallet on the selected network')
  .action(async (options) => {
    await createWalletCommand();
  });

// Add the balance command
program
  .command('balance')
  .description('Check the balance of the saved wallet')
  .option('-t, --testnet', 'Check the balance on the testnet')
  .action(async (options) => {
    // Determine the network based on the flag
    const network = options.testnet ? 'testnet' : 'mainnet';

    // Pass the network option to the balance command
    await balanceCommand(options.testnet);
  });

// Add the transfer command
program
  .command('transfer')
  .description('Transfer rBTC to the provided address')
  .option('-t, --testnet', 'Transfer on the testnet')
  .requiredOption('-a, --address <address>', 'Recipient address')
  .requiredOption('-v, --value <value>', 'Amount to transfer in rBTC')
  .action(async (options) => {
    try {
      // Execute the transfer command with the provided options
      await transferCommand(options.testnet, options.address, parseFloat(options.value));
    } catch (error) {
      console.error(chalk.red('Error during transfer:'), error);
    }
  });

// Parse command-line arguments
program.parse(process.argv);
