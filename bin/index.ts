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
import { monitorCommand, listMonitoringSessions, stopMonitoringSession } from "../src/commands/monitor.js";
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
  attestDeployment?: boolean;
  attestVerification?: boolean;
  attestTransfer?: boolean;
  attestSchemaUid?: string;
  attestRecipient?: string;
  attestReason?: string;
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
  .version("1.3.1", "-v, --version", "Display the current version");

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
  .action(async (options: CommandOptions) => {
    await balanceCommand({
      testnet: !!options.testnet,
      walletName: options.wallet!,
    });
  });

program
  .command("transfer")
  .description("Transfer RBTC or ERC20 tokens to the provided address")
  .option("-t, --testnet", "Transfer on the testnet")
  .option("--wallet <wallet>", "Name of the wallet")
  .option("-a, --address <address>", "Recipient address")
  .option("--token <address>", "ERC20 token contract address (optional, for token transfers)")
  .option("--value <value>", "Amount to transfer")
  .option("-i, --interactive", "Execute interactively and input transactions")
  .option("--gas-limit <limit>", "Custom gas limit")
  .option("--gas-price <price>", "Custom gas price in RBTC")
  .option("--data <data>", "Custom transaction data (hex)")
  .option("--attest-transfer", "Create attestation for significant transfers")
  .option("--attest-schema-uid <uid>", "Custom schema UID for attestation")
  .option("--attest-recipient <address>", "Custom recipient for attestation (default: transfer recipient)")
  .option("--attest-reason <reason>", "Reason/purpose for the transfer (e.g., 'Grant payment', 'Bounty reward')")
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

      const address = options.address
        ? (`0x${options.address.replace(/^0x/, "")}` as `0x${string}`)
        : await selectAddress();

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
          attestation: {
            enabled: !!options.attestTransfer,
            schemaUID: options.attestSchemaUid,
            recipient: options.attestRecipient,
            reason: options.attestReason
          }
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
  .option("--attest-deployment", "Create attestation for deployment")
  .option("--attest-schema-uid <uid>", "Custom schema UID for attestation")
  .option("--attest-recipient <address>", "Custom recipient for attestation (default: contract address)")
  .action(async (options: CommandOptions) => {
    const args = options.args || [];
    await deployCommand(
      {
        abiPath: options.abi!,
        bytecodePath: options.bytecode!,
        testnet: !!options.testnet,
        args: args,
        name: options.wallet!,
        attestation: {
          enabled: !!options.attestDeployment,
          schemaUID: options.attestSchemaUid,
          recipient: options.attestRecipient
        }
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
  .option("--attest-verification", "Create attestation for contract verification")
  .option("--attest-schema-uid <uid>", "Custom schema UID for attestation")
  .option("--attest-recipient <address>", "Custom recipient for attestation (default: contract address)")
  .action(async (options: CommandOptions) => {
    const args = options.decodedArgs || [];
    await verifyCommand(
      {
        jsonPath: options.json!,
        address: options.address!,
        name: options.name!,
        testnet: !!options.testnet,
        args: args,
        attestation: {
          enabled: !!options.attestVerification,
          schemaUID: options.attestSchemaUid,
          recipient: options.attestRecipient
        }
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
      testnet: !!options.testnet,
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
  .action(async (options) => {
    try {
      const interactive = !!options.interactive;
      const testnet = !!options.testnet;
      const file = options.file;

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
      });
    } catch (error: any) {
      console.error(
        chalk.red("🚨 Error during batch transfer:"),
        chalk.yellow(error.message || "Unknown error")
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

program.parse(process.argv);
