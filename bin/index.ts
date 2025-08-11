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
import { bridgeCommand } from "../src/commands/bridge.js";
import { batchTransferCommand } from "../src/commands/batchTransfer.js";
import { historyCommand } from "../src/commands/history.js";
import { selectAddress } from "../src/commands/selectAddress.js";
import { resolveCommand } from "../src/commands/resolve.js";
import { transactionCommand } from "../src/commands/transaction.js";
import { parseEther } from "viem";

interface CommandOptions {
  testnet?: boolean;
  address?: Address;
  contract?: Address;
  value?: string;
  txid?: string;
  abi?: string;
  bytecode?: string;
  apiKey?: string;
  args?: any;
  json?: any;
  name?: string;
  decodedArgs?: any;
  wallet?: string;
  number?: string;
  file?: string;
  interactive?: boolean;
  token?: Address;
  reverse?: boolean;
  gasLimit?: string;
  gasPrice?: string;
  data?: string;
  rns?: string;
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
  .version("1.1.0", "-v, --version", "Display the current version");

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
  .option("--wallet <wallet>", "Name of the wallet")
  .option("-a ,--address <address>", "Token holder address")
  .option("--rns <domain>", "Token holder RNS domain (e.g., alice.rsk)")
  .action(async (options: CommandOptions) => {
    // Handle RNS domain resolution if provided
    let holderAddress = options.address;
    if (options.rns) {
      const { resolveRNSToAddress } = await import("../src/utils/rnsHelper.js");
      const ViemProvider = (await import("../src/utils/viemProvider.js")).default;
      
      const provider = new ViemProvider(!!options.testnet);
      const client = await provider.getPublicClient();
      
      const resolvedAddress = await resolveRNSToAddress(client, options.rns, !!options.testnet);
      if (!resolvedAddress) {
        console.error(chalk.red(`Failed to resolve RNS domain: ${options.rns}`));
        return;
      }
      holderAddress = resolvedAddress;
    }
    
    await balanceCommand(!!options.testnet, options.wallet!, holderAddress);
  });

program
  .command("transfer")
  .description("Transfer RBTC or ERC20 tokens to the provided address")
  .option("-t, --testnet", "Transfer on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .option("-a, --address <address>", "Recipient address")
  .option("--rns <domain>", "Recipient RNS domain (e.g., alice.rsk)")
  .option("--token <address>", "ERC20 token contract address (optional, for token transfers)")
  .option("--value <value>", "Amount to transfer")
  .option("-i, --interactive", "Execute interactively and input transactions")
  .option("--gas-limit <limit>", "Custom gas limit")
  .option("--gas-price <price>", "Custom gas price in RBTC")
  .option("--data <data>", "Custom transaction data (hex)")
  .action(async (options: CommandOptions) => {
    try {
      if (options.interactive) {
        await batchTransferCommand(undefined, !!options.testnet, true);
        return;
      }

      if (!options.value) {
        throw new Error("Value is required for the transfer.");
      }

      const value = parseFloat(options.value);

      if (isNaN(value) || value <= 0) {
        throw new Error("Invalid value specified for transfer.");
      }

      // Handle RNS domain resolution
      let address: `0x${string}`;
      if (options.rns) {
        // Import RNS helper and resolve domain
        const { resolveRNSToAddress } = await import("../src/utils/rnsHelper.js");
        const ViemProvider = (await import("../src/utils/viemProvider.js")).default;
        
        const provider = new ViemProvider(!!options.testnet);
        const client = await provider.getPublicClient();
        
        const resolvedAddress = await resolveRNSToAddress(client, options.rns, !!options.testnet);
        if (!resolvedAddress) {
          throw new Error(`Failed to resolve RNS domain: ${options.rns}`);
        }
        address = resolvedAddress;
      } else if (options.address) {
        address = `0x${options.address.replace(/^0x/, "")}` as `0x${string}`;
      } else {
        address = await selectAddress();
      }

      const txOptions = {
        ...(options.gasLimit && { gasLimit: BigInt(options.gasLimit) }),
        ...(options.gasPrice && { gasPrice: parseEther(options.gasPrice.toString()) }),
        ...(options.data && { data: options.data as `0x${string}` })
      };

      await transferCommand(
        !!options.testnet,
        address,
        value,
        options.wallet!,
        options.token as `0x${string}` | undefined,
        Object.keys(txOptions).length > 0 ? txOptions : undefined
      );
    } catch (error: any) {
      console.error(
        chalk.red("Error during transfer:"),
        error.message || error
      );
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
  .option("--wallet <wallet>", "Name of the wallet")
  .option("--args <args...>", "Constructor arguments (space-separated)")
  .option("-t, --testnet", "Deploy on the testnet")
  .action(async (options: CommandOptions) => {
    const args = options.args || [];
    await deployCommand(
      options.abi!,
      options.bytecode!,
      !!options.testnet,
      args,
      options.wallet!
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
    "--decodedArgs <args...>",
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

program
  .command("bridge")
  .description("Interact with RSK bridge")
  .option("-t, --testnet", "Deploy on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .action(async (options: CommandOptions) => {
    await bridgeCommand(!!options.testnet, options.wallet!);
  });

program
  .command("history")
  .description("Fetch history for current wallet")
  .option("--apiKey <apiKey", "Alchemy API key")
  .option("--number <number>", "Number of transactions to fetch")
  .option("-t, --testnet", "History of wallet on the testnet")
  .action(async (options: CommandOptions) => {
    await historyCommand(!!options.testnet, options.apiKey!, options.number!);
  });

program
  .command("batch-transfer")
  .description("Execute batch transactions interactively or from stdin")
  .option("-i, --interactive", "Execute interactively and input transactions")
  .option("-t, --testnet", "Execute on the testnet")
  .option("-f, --file <path>", "Execute transactions from a file")
  .option("--rns", "Enable RNS domain resolution for recipient addresses")
  .action(async (options) => {
    try {
      const interactive = !!options.interactive;
      const testnet = !!options.testnet;
      const file = options.file;
      const resolveRNS = !!options.rns;

      if (interactive && file) {
        console.error(
          chalk.red(
            "🚨 Cannot use both interactive mode and file input simultaneously."
          )
        );
        return;
      }

      await batchTransferCommand(file, testnet, interactive, resolveRNS);
    } catch (error: any) {
      console.error(
        chalk.red("🚨 Error during batch transfer:"),
        chalk.yellow(error.message || "Unknown error")
      );
    }
  });

program
  .command("resolve <name>")
  .description("Resolve RNS names to addresses or reverse lookup addresses to names")
  .option("-t, --testnet", "Use testnet (currently mainnet only)")
  .option("-r, --reverse", "Reverse lookup: address to name")
  .action(async (name: string, options: CommandOptions) => {
    await resolveCommand(name, !!options.testnet, !!options.reverse);
  });

program.parse(process.argv);
