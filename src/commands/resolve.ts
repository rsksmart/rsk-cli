import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import ora from "ora";
import { Address, namehash } from "viem";

// RNS Contract Addresses
const RNS_REGISTRY_MAINNET = "0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5" as Address;
const RNS_RESOLVER_MAINNET = "0xD87f8121D44F3717d4bAdC50b24E50044f86D64B" as Address;

// RNS Testnet Contract Addresses
const RNS_REGISTRY_TESTNET = "0x7d284aaac6e925aad802a53c0c69efe3764597b8" as Address;
const RNS_RESOLVER_TESTNET = "0x1e321bf4e5f0c20e5f5afaa2390ef6ff8cff8a7b" as Address;

// Simplified RNS Registry ABI
const RNS_REGISTRY_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
] as const;

// Simplified RNS Resolver ABI
const RNS_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "addr",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

export async function resolveCommand(
  name: string,
  testnet: boolean,
  reverse: boolean
) {
  const spinner = ora();

  try {
    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    if (reverse) {
      // Reverse resolution: address -> name
      spinner.start(chalk.white("🔍 Looking up name for address..."));
      
      try {
        const address = name as Address;
        const resolverAddress = testnet ? RNS_RESOLVER_TESTNET : RNS_RESOLVER_MAINNET;
        
        const resolverName = await client.readContract({
          address: resolverAddress,
          abi: RNS_RESOLVER_ABI,
          functionName: "name",
          args: [address],
        });

        if (resolverName && resolverName !== "") {
          spinner.succeed(chalk.green("Name found successfully"));
          console.log(chalk.white(`📄 Address:`), chalk.green(address));
          console.log(chalk.white(`🏷️  Name:`), chalk.green(resolverName));
        } else {
          spinner.fail(chalk.yellow("⚠️ No name found for this address"));
        }
      } catch (error) {
        spinner.fail(chalk.red("❌ Failed to reverse resolve address"));
        console.error(chalk.yellow("This address may not have a reverse record set"));
      }
    } else {
      // Forward resolution: name -> address
      spinner.start(chalk.white(`🔍 Resolving ${name}...`));

      // Ensure name ends with .rsk
      if (!name.endsWith(".rsk")) {
        name = name + ".rsk";
      }

      // Calculate namehash for the domain
      const node = namehash(name);

      // Get resolver address from registry
      const registryAddress = testnet ? RNS_REGISTRY_TESTNET : RNS_REGISTRY_MAINNET;
      const resolverAddress = await client.readContract({
        address: registryAddress,
        abi: RNS_REGISTRY_ABI,
        functionName: "resolver",
        args: [node],
      }) as Address;

      if (resolverAddress === "0x0000000000000000000000000000000000000000") {
        spinner.fail(chalk.yellow(`⚠️ No resolver found for ${name}`));
        console.log(chalk.blue("💡 This domain may not be registered"));
        return;
      }

      // Get address from resolver
      const resolvedAddress = await client.readContract({
        address: resolverAddress,
        abi: RNS_RESOLVER_ABI,
        functionName: "addr",
        args: [node],
      }) as Address;

      if (resolvedAddress === "0x0000000000000000000000000000000000000000") {
        spinner.fail(chalk.yellow(`⚠️ No address set for ${name}`));
        console.log(chalk.blue("💡 This domain exists but has no address configured"));
        return;
      }

      spinner.succeed(chalk.green("Domain resolved successfully"));
      
      console.log(chalk.white(`🏷️  Domain:`), chalk.green(name));
      console.log(chalk.white(`📄 Address:`), chalk.green(resolvedAddress));
      console.log(
        chalk.white(`🌐 Network:`),
        chalk.green(testnet ? "Rootstock Testnet" : "Rootstock Mainnet")
      );
    }
  } catch (error) {
    spinner.stop();
    if (error instanceof Error) {
      console.error(
        chalk.red("🚨 Error resolving name:"),
        chalk.yellow(error.message)
      );
    } else {
      console.error(chalk.red("🚨 An unknown error occurred"));
    }
  }
}