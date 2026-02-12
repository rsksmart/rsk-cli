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
import { configCommand } from "../src/commands/config.js";
import { transactionCommand } from "../src/commands/transaction.js";
import { monitorCommand, listMonitoringSessions, stopMonitoringSession } from "../src/commands/monitor.js";
import { simulateCommand, TransactionSimulationOptions } from "../src/commands/simulate.js";
import { parseEther } from "viem";
import { resolveRNSToAddress } from "../src/utils/rnsHelper.js";
import { validateAndFormatAddressRSK } from "../src/utils/index.js";
import { rnsUpdateCommand } from "../src/commands/rnsUpdate.js";
import { rnsTransferCommand } from "../src/commands/rnsTransfer.js";
import { rnsRegisterCommand } from "../src/commands/rnsRegister.js";

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
  tx?: string;
  confirmations?: number;
  balance?: boolean;
  transactions?: boolean;
  list?: boolean;
  stop?: string;
  monitor?: boolean;
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
  .version("1.4.0", "-v, --version", "Display the current version");

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
    let holderAddress = options.address;
    if (options.rns) {
      const resolvedAddress = await resolveRNSToAddress({
        name: options.rns,
        testnet: !!options.testnet,
        isExternal: false
      });
      if (!resolvedAddress) {
        throw new Error(`Failed to resolve RNS domain: ${options.rns}`);
      }
      holderAddress = resolvedAddress;
    }

    await balanceCommand({
      testnet: options.testnet,
      walletName: options.wallet!,
      address: holderAddress,
    });
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
        await batchTransferCommand({
          testnet: !!options.testnet,
          interactive: true,
        });
        return;
      }

      if (!options.value) {
        throw new Error("Value is required for the transfer.");
      }

      const value = parseFloat(options.value);

      if (isNaN(value) || value <= 0) {
        throw new Error("Invalid value specified for transfer.");
      }

      let address: `0x${string}`;
      if (options.rns) {
        const resolvedAddress = await resolveRNSToAddress({
          name: options.rns,
          testnet: !!options.testnet,
          isExternal: false
        });
        if (!resolvedAddress) {
          throw new Error(`Failed to resolve RNS domain: ${options.rns}`);
        }
        const formatted = validateAndFormatAddressRSK(resolvedAddress as string, !!options.testnet);
        if (!formatted) {
          throw new Error(`Invalid resolved address for domain: ${options.rns}`);
        }
        address = formatted as `0x${string}`;
      } else if (options.address) {
        const formatted = validateAndFormatAddressRSK(String(options.address), !!options.testnet);
        if (!formatted) {
          throw new Error("Invalid recipient address");
        }
        address = formatted as `0x${string}`;
      } else {
        address = await selectAddress();
      }

      const txOptions = {
        ...(options.gasLimit && { gasLimit: BigInt(options.gasLimit) }),
        ...(options.gasPrice && { gasPrice: parseEther(options.gasPrice.toString()) }),
        ...(options.data && { data: options.data as `0x${string}` })
      };

      await transferCommand(
        {
          testnet: !!options.testnet,
          toAddress: address,
          value: value,
          name: options.wallet!,
          tokenAddress: options.token as `0x${string}` | undefined,
        }
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
  .option("--monitor", "Keep monitoring the transaction until confirmation")
  .option("--confirmations <number>", "Required confirmations for monitoring (default: 12)")
  .action(async (options: CommandOptions) => {
    const formattedTxId = options.txid!.startsWith("0x")
      ? options.txid
      : `0x${options.txid}`;

    await txCommand({
      testnet: !!options.testnet,
      txid: formattedTxId as `0x${string}`,
      isExternal: false,
      monitor: !!options.monitor,
      confirmations: options.confirmations ? parseInt(options.confirmations.toString()) : undefined,
    });
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
      {
        abiPath: options.abi!,
        bytecodePath: options.bytecode!,
        testnet: options.testnet,
        args: args,
        name: options.wallet!,
      }
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
      {
        jsonPath: options.json!,
        address: options.address!,
        name: options.name!,
        testnet:  options.testnet === undefined ? undefined : !!options.testnet,
        args: args,
      }
    );
  });

program
  .command("contract")
  .description("Interact with a contract")
  .requiredOption("-a, --address <address>", "Address of a verified contract")
  .option("-t, --testnet", "Deploy on the testnet")
  .action(async (options: CommandOptions) => {
    await ReadContract({
      address: options.address! as `0x${string}`,
      testnet: !!options.testnet,
    });
  });

program
  .command("bridge")
  .description("Interact with RSK bridge")
  .option("-t, --testnet", "Deploy on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .action(async (options: CommandOptions) => {
    await bridgeCommand({
      testnet: options.testnet === undefined ? undefined : !!options.testnet,
      name: options.wallet!,
    });
  });

program
  .command("history")
  .description("Fetch history for current wallet")
  .option("--apiKey <apiKey", "Alchemy API key")
  .option("--number <number>", "Number of transactions to fetch")
  .option("-t, --testnet", "History of wallet on the testnet")
  .action(async (options: CommandOptions) => {
    await historyCommand({
      testnet: !!options.testnet,
      apiKey: options.apiKey!,
      number: options.number!,
    });
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

      await batchTransferCommand({
        filePath: file,
        testnet: testnet,
        interactive: interactive,
        resolveRNS: resolveRNS,
      });
    } catch (error: any) {
      console.error(
        chalk.red("🚨 Error during batch transfer:"),
        chalk.yellow(error.message || "Unknown error")
      );
    }
  });

program
  .command("config")
  .description("Manage CLI configuration settings")
  .action(async () => {
    await configCommand();
  });

program
  .command("transaction")
  .description("Create and send transactions (simple, advanced, or raw)")
  .option("-t, --testnet", "Execute on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .option("-a, --address <address>", "Recipient address")
  .option("--token <address>", "ERC20 token contract address (optional, for token transfers)")
  .option("--value <value>", "Amount to transfer")
  .option("--gas-limit <limit>", "Custom gas limit")
  .option("--gas-price <price>", "Custom gas price in RBTC")
  .option("--data <data>", "Custom transaction data (hex)")
  .action(async (options: CommandOptions) => {
    try {
      await transactionCommand(
        options.testnet,
        options.address as `0x${string}` | undefined,
        options.value ? parseFloat(options.value) : undefined,
        options.wallet,
        options.token as `0x${string}` | undefined,
        {
          ...(options.gasLimit && { gasLimit: BigInt(options.gasLimit) }),
          ...(options.gasPrice && { gasPrice: parseEther(options.gasPrice.toString()) }),
          ...(options.data && { data: options.data as `0x${string}` })
        }
      );
    } catch (error: any) {
      console.error(
        chalk.red("Error during transaction:"),
        error.message || error
      );
    }
  });

program
  .command("monitor")
  .description("Monitor addresses or transactions with real-time updates")
  .option("-t, --testnet", "Monitor on the testnet")
  .option("-a, --address <address>", "Address to monitor")
  .option("--tx <txid>", "Transaction ID to monitor")
  .option("--confirmations <number>", "Required confirmations for transaction monitoring (default: 12)")
  .option("--balance", "Monitor address balance changes")
  .option("--transactions", "Monitor address transaction history")
  .option("--list", "List active monitoring sessions")
  .option("--stop <sessionId>", "Stop a specific monitoring session")
  .action(async (options: CommandOptions) => {
    try {
      if (options.list) {
        await listMonitoringSessions(!!options.testnet);
        return;
      }

      if (options.stop) {
        await stopMonitoringSession(options.stop, !!options.testnet);
        return;
      }

      const address = options.address
        ? (`0x${options.address.replace(/^0x/, "")}` as `0x${string}`)
        : undefined;

      const tx = options.tx
        ? (options.tx.startsWith("0x") ? options.tx : `0x${options.tx}`) as `0x${string}`
        : undefined;

      await monitorCommand({
        testnet: !!options.testnet,
        address: address as Address | undefined,
        monitorBalance: options.balance !== false,
        monitorTransactions: !!options.transactions,
        tx,
        confirmations: options.confirmations ? parseInt(options.confirmations.toString()) : undefined,
        isExternal: false
      });
    } catch (error: any) {
      console.error(
        chalk.red("Error during monitoring:"),
        error.message || error
      );
    }
  });

program
  .command("simulate")
  .description("Simulate RBTC or ERC20 token transfers without execution")
  .option("-t, --testnet", "Simulate on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .requiredOption("-a, --address <address>", "Recipient address")
  .option("--token <address>", "ERC20 token contract address (optional, for token transfers)")
  .requiredOption("--value <value>", "Amount to transfer")
  .option("--gas-limit <limit>", "Custom gas limit")
  .option("--gas-price <price>", "Custom gas price in RBTC")
  .option("--data <data>", "Custom transaction data (hex)")
  .action(async (options: CommandOptions) => {
    try {
      if (!options.value) {
        throw new Error("Value is required for the simulation.");
      }

      const value = parseFloat(options.value);

      if (isNaN(value) || value <= 0) {
        throw new Error("Invalid value specified for simulation.");
      }

      const address = options.address
        ? (`0x${options.address.replace(/^0x/, "")}` as `0x${string}`)
        : null;

      if (!address) {
        throw new Error("Recipient address is required for simulation.");
      }

      const simulateOptions: TransactionSimulationOptions = {
        testnet: !!options.testnet,
        toAddress: address,
        value: value,
        name: options.wallet,
        tokenAddress: options.token as `0x${string}` | undefined,
        ...(options.gasLimit && { gasLimit: BigInt(options.gasLimit) }),
        ...(options.gasPrice && { gasPrice: parseEther(options.gasPrice.toString()) }),
        ...(options.data && { data: options.data as `0x${string}` })
      };

      await simulateCommand(simulateOptions);
    } catch (error: any) {
      console.error(
        chalk.red("Error during simulation:"),
        error.message || error
      );
    }
  });

program
  .command("rns")
  .description("RNS Manager: Register, Transfer, Update, or Resolve domains")
  .option("--register <domain>", "Register a new RNS domain")
  .option("--transfer <domain>", "Transfer ownership of a domain")
  .option("--update <domain>", "Update resolver records for a domain")
  .option("--resolve <name>", "Resolve a name to address (or address to name)")

  .option("-t, --testnet", "Use testnet network")
  .option("-w, --wallet <wallet>", "Wallet name or private key to use")
  .option("--recipient <address>", "Recipient address (required for --transfer)")
  .option("--address <address>", "New address to set (required for --update)")
  .option("-r, --reverse", "Perform reverse lookup (required for --resolve)")

  .action(async (options: any) => {
    const actions = [
      options.register ? "register" : null,
      options.transfer ? "transfer" : null,
      options.update ? "update" : null,
      options.resolve ? "resolve" : null,
    ].filter(Boolean);

    if (actions.length === 0) {
      console.error(chalk.red("❌ Error: You must specify an action."));
      console.log("Try: --register, --transfer, --update, or --resolve");
      process.exit(1);
    }
    if (actions.length > 1) {
      console.error(chalk.red("❌ Error: Please specify only one action at a time."));
      process.exit(1);
    }

    const action = actions[0];

    try {
      switch (action) {
        case "register":
          await rnsRegisterCommand({
            domain: options.register,
            wallet: options.wallet,
            testnet: !!options.testnet,
          });
          break;

        case "transfer":
          if (!options.recipient) {
            console.error(chalk.red("❌ Error: --recipient <address> is required for transfer."));
            process.exit(1);
          }
          await rnsTransferCommand({
            domain: options.transfer,
            recipient: options.recipient,
            wallet: options.wallet,
            testnet: !!options.testnet,
          });
          break;

        case "update":
          if (!options.address) {
            console.error(chalk.red("❌ Error: --address <address> is required for update."));
            process.exit(1);
          }
          await rnsUpdateCommand({
            domain: options.update,
            address: options.address,
            wallet: options.wallet,
            testnet: !!options.testnet,
          });
          break;

        case "resolve":
          await resolveCommand({
            name: options.resolve,
            testnet: !!options.testnet,
            reverse: !!options.reverse,
          });
          break;
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Operation failed: ${error.message || error}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
