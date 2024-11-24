#!/usr/bin/env node
import { Command } from "commander";
import { walletCommand } from "../src/commands/wallet.js";
import { balanceCommand } from "../src/commands/balance.js";
import { transferCommand } from "../src/commands/transfer.js";
import { txCommand } from "../src/commands/tx.js";
import figlet from "figlet";
import chalk from "chalk";
import { deployCommand } from "../src/commands/deploy.js";
import { verifyCommand } from "../src/commands/verify.js";
import { ReadContract } from "../src/commands/contract.js";
import { Address } from "viem";
import { checkTokenBalance, transferToken } from "../src/commands/token.js";

interface CommandOptions {
  testnet?: boolean;
  address?: Address;
  contract?: Address;
  value?: string;
  txid?: string;
  abi?: string;
  bytecode?: string;
  args?: any;
  json?: any;
  name?: string;
  decodedArgs?: any;
}

const orange = chalk.rgb(255, 165, 0);

console.log(
  orange(
    figlet.textSync("Rootstock", {
      font: "3D-ASCII",
      horizontalLayout: "fitted",
      verticalLayout: "fitted",
    })
  )
);

const program = new Command();

program
  .name("rsk-cli")
  .description("CLI tool for interacting with Rootstock blockchain")
  .version("0.0.");

program
  .command("wallet")
  .description(
    "Manage your wallet: create a new one, use an existing wallet, or import a custom wallet"
  )
  .action(async () => {
    await walletCommand();
  });

program
  .command("balance")
  .description("Check the balance of the saved wallet")
  .option("-t, --testnet", "Check the balance on the testnet")
  .action(async (options: CommandOptions) => {
    await balanceCommand(!!options.testnet);
  });

program
  .command("transfer")
  .description("Transfer rBTC to the provided address")
  .option("-t, --testnet", "Transfer on the testnet")
  .requiredOption("-a, --address <address>", "Recipient address")
  .requiredOption("-v, --value <value>", "Amount to transfer in rBTC")
  .action(async (options: CommandOptions) => {
    try {
      const address = `0x${options.address!.replace(
        /^0x/,
        ""
      )}` as `0x${string}`;
      await transferCommand(
        !!options.testnet,
        address,
        parseFloat(options.value!)
      );
    } catch (error) {
      console.error(chalk.red("Error during transfer:"), error);
    }
  });

program
  .command("tx")
  .description("Check the status of a transaction")
  .option("-t, --testnet", "Check the transaction status on the testnet")
  .requiredOption("-i, --txid <txid>", "Transaction ID")
  .action(async (options: CommandOptions) => {
    const formattedTxId = options.txid!.startsWith("0x")
      ? options.txid
      : `0x${options.txid}`;

    await txCommand(!!options.testnet, formattedTxId as `0x${string}`);
  });

program
  .command("deploy")
  .description("Deploy a contract")
  .requiredOption("--abi <path>", "Path to the ABI file")
  .requiredOption("--bytecode <path>", "Path to the bytecode file")
  .option("--args <args...>", "Constructor arguments (space-separated)")
  .option("-t, --testnet", "Deploy on the testnet")
  .action(async (options: CommandOptions) => {
    const args = options.args || [];
    await deployCommand(
      options.abi!,
      options.bytecode!,
      !!options.testnet,
      args
    );
  });

program
  .command("verify")
  .description("Verify a contract")
  .requiredOption("--json <path>", "Path to the JSON Standard Input")
  .requiredOption("--name <name>", "Name of the contract")
  .requiredOption("-a, --address <address>", "Address of the deployed contract")
  .option("-t, --testnet", "Deploy on the testnet")
  .option(
    "-da, --decodedArgs <args...>",
    "Decoded Constructor arguments (space-separated)"
  )
  .action(async (options: CommandOptions) => {
    const args = options.decodedArgs || [];
    await verifyCommand(
      options.json!,
      options.address!,
      options.name!,
      !!options.testnet,
      args
    );
  });

program
  .command("contract")
  .description("Interact with a contract")
  .requiredOption("-a, --address <address>", "Address of a verified contract")
  .option("-t, --testnet", "Deploy on the testnet")
  .action(async (options: CommandOptions) => {
    await ReadContract(options.address! as `0x${string}`, !!options.testnet);
  });

const token = program
  .command("token")
  .description("Interact with ERC20 tokens");

token
  .command("balance")
  .description("Check token balance")
  .requiredOption("-c,--contract <address>", "Token contract address")
  .option("-a ,--address <address>", "Token holder address")
  .option("-t, --testnet", "Use testnet")
  .action(async (options: CommandOptions) => {
    await checkTokenBalance(
      !!options.testnet,
      options.contract as Address,
      options.address
    );
  });

token
  .command("transfer")
  .description("Transfer tokens")
  .requiredOption("-c,--contract <address>", "Token contract address")
  .requiredOption("-a,--address <address>", "Recipient address")
  .requiredOption("-v,--value <amount>", "Amount to transfer")
  .option("-t, --testnet", "Use testnet")
  .action(async (options: CommandOptions) => {
    await transferToken(
      !!options.testnet,
      options.contract as Address,
      options.address as Address,
      options.value!
    );
  });

program.parse(process.argv);
