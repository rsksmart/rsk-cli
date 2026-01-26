import chalk from "chalk";
import ora from "ora";
import {
  Flyover,
} from "@rsksmart/flyover-sdk";
import { formatEther } from "viem";

type SwapCommandOptions = {
  testnet?: boolean;
  pegin?: boolean;
  pegout?: boolean;
  amount?: number;
  btcAddress?: string;
  wallet?: string;
  liquidity?: boolean;
  interactive?: boolean;
  isExternal?: boolean;
  provider?: string;
};

type SwapResult = {
  success: boolean;
  data?: {
    type: "liquidity";
    network: string;
  };
  error?: string;
};

function logMessage(
  params: SwapCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: SwapCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: SwapCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: SwapCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: SwapCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: SwapCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

// Captcha resolver - returns test token
const captchaTokenResolver = async (): Promise<string> => {
  return process.env.FLYOVER_CAPTCHA_TOKEN || "";
};

export async function swapCommand(
  params: SwapCommandOptions
): Promise<SwapResult | void> {
  const spinner = ora();

  try {
    const network = params.testnet ? "Testnet" : "Mainnet";

    // Show redirect message if user tried pegin/pegout
    if (params.pegin || params.pegout) {
      logMessage(params, chalk.yellow(`\n⚠️  Swap execution is not available via CLI due to provider captcha requirements.`));
      logMessage(params, chalk.cyan(`\nShowing available liquidity instead...\n`));
    }

    logInfo(params, `\n🔧 Checking Flyover Liquidity for ${network}...`);

    // Helper to create Flyover with RSK connection
    const createFlyover = async () => {
      const rpcUrl = params.testnet
        ? "https://public-node.testnet.rsk.co"
        : "https://public-node.rsk.co";

      logInfo(params, `🔗 Connecting to RPC: ${rpcUrl}`);

      const { BlockchainReadOnlyConnection } = await import("@rsksmart/bridges-core-sdk");
      const rskConnection = await BlockchainReadOnlyConnection.createUsingRpc(rpcUrl);

      logInfo(params, `✅ RSK connection created`);

      const flyover = new Flyover({
        network: params.testnet ? "Testnet" : "Mainnet",
        allowInsecureConnections: params.testnet ? true : false,
        captchaTokenResolver,
        rskConnection: rskConnection,
      });

      logInfo(params, `✅ Flyover SDK initialized`);

      return flyover;
    };

    // Check liquidity
    startSpinner(params, spinner, "Connecting to RSK network...");

    try {
      const flyover = await createFlyover();
      stopSpinner(params, spinner);

      startSpinner(params, spinner, "Fetching available liquidity...");
      const providers = await flyover.getLiquidityProviders();
      stopSpinner(params, spinner);

      if (!providers || providers.length === 0) {
        logError(params, "No liquidity providers available");
        return { success: false, error: "No liquidity providers available" };
      }

      logSuccess(params, "\n✅ Liquidity Information Retrieved!\n");
      logMessage(params, chalk.cyan("💧 Available Liquidity Providers:"));
      logMessage(params, chalk.gray("─".repeat(50)));

      for (const provider of providers) {
        logMessage(params, chalk.white(`\n📍 Provider: ${provider.name || "Unknown"}`));
        logMessage(params, chalk.gray(`   Address: ${provider.provider}`));
        logMessage(params, chalk.gray(`   API: ${provider.apiBaseUrl}`));

        if (provider.pegin) {
          const minPegin = provider.pegin.minTransactionValue
            ? formatEther(BigInt(provider.pegin.minTransactionValue))
            : "N/A";
          const maxPegin = provider.pegin.maxTransactionValue
            ? formatEther(BigInt(provider.pegin.maxTransactionValue))
            : "N/A";
          logMessage(params, chalk.green(`   🔹 Peg-In (BTC → RBTC):`));
          logMessage(params, chalk.white(`      Min: ${minPegin} BTC`));
          logMessage(params, chalk.white(`      Max: ${maxPegin} BTC`));
          logMessage(params, chalk.white(`      Confirmations: ${provider.pegin.requiredConfirmations}`));
        }

        if (provider.pegout) {
          const minPegout = provider.pegout.minTransactionValue
            ? formatEther(BigInt(provider.pegout.minTransactionValue))
            : "N/A";
          const maxPegout = provider.pegout.maxTransactionValue
            ? formatEther(BigInt(provider.pegout.maxTransactionValue))
            : "N/A";
          logMessage(params, chalk.yellow(`   🔸 Peg-Out (RBTC → BTC):`));
          logMessage(params, chalk.white(`      Min: ${minPegout} RBTC`));
          logMessage(params, chalk.white(`      Max: ${maxPegout} RBTC`));
          logMessage(params, chalk.white(`      Confirmations: ${provider.pegout.requiredConfirmations}`));
        }
      }

      logMessage(params, chalk.gray("\n─".repeat(50)));
      logMessage(params, chalk.blue(`🌐 Network: Rootstock ${network}`));

      // Show web interface link for actual swaps
      logMessage(params, chalk.yellow(`\n💡 To execute swaps (BTC ↔ RBTC):`));
      logMessage(params, chalk.cyan.bold(`   → https://app.flyover.rif.technology`));
      logMessage(params, chalk.gray(`\n   The web interface provides the same secure Flyover protocol`));
      logMessage(params, chalk.gray(`   with full functionality for peg-in and peg-out operations.\n`));

      return {
        success: true,
        data: {
          type: "liquidity",
          network,
        }
      };
    } catch (error: any) {
      stopSpinner(params, spinner);
      logError(params, `Failed to fetch liquidity: ${error.message}`);
      return { success: false, error: error.message };
    }

  } catch (error: any) {
    stopSpinner(params, spinner);
    logError(params, `Command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
