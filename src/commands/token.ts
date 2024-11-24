import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { Address, formatUnits } from "viem";
import { getTokenInfo } from "../utils/tokenHelper.js";
import { erc20ABI } from "../constants/erc20ABI.js";
import { isValidContract, validateAndFormatAddress } from "../utils/index.js";

const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

// export async function checkTokenBalance(
//   testnet: boolean,
//   contractAddress: Address,
//   holderAddress: Address
// ) {
//   try {
//     if (!fs.existsSync(walletFilePath)) {
//       console.log(
//         chalk.red("🚫 No saved wallet found. Please create a wallet first.")
//       );
//       return;
//     }

//     const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
//     const { address: walletAddress } = walletData;

//     if (!walletAddress) {
//       console.log(chalk.red("⚠️ No valid address found in the saved wallet."));
//       return;
//     }

//     const provider = new ViemProvider(testnet);

//     const publicClient = await provider.getPublicClient();
//     const balance = await publicClient.getBalance({ address: walletAddress });

//     const rbtcBalance = Number(balance) / 10 ** 18;

//     console.log(chalk.white(`📄 Wallet Address:`), chalk.green(walletAddress));
//     console.log(chalk.white(`🎯 Recipient Address:`), chalk.green(toAddress));
//     console.log(
//       chalk.white(`💵 Amount to Transfer:`),
//       chalk.green(`${value} RBTC`)
//     );
//     console.log(
//       chalk.white(`💰 Current Balance:`),
//       chalk.green(`${rbtcBalance} RBTC`)
//     );

//     if (rbtcBalance < value) {
//       console.log(
//         chalk.red(`🚫 Insufficient balance to transfer ${value} RBTC.`)
//       );
//       return;
//     }

//     const walletClient = await provider.getWalletClient();

//     const account = walletClient.account;
//     if (!account) {
//       console.log(
//         chalk.red(
//           "⚠️ Failed to retrieve the account. Please ensure your wallet is correctly set up."
//         )
//       );
//       return;
//     }

//     const txHash = await walletClient.sendTransaction({
//       account: account,
//       chain: provider.chain,
//       to: toAddress,
//       value: BigInt(value * 10 ** 18),
//     });

//     console.log(
//       chalk.white(`🔄 Transaction initiated. TxHash:`),
//       chalk.green(txHash)
//     );
//     const spinner = ora("⏳ Waiting for confirmation...").start();

//     const receipt = await publicClient.waitForTransactionReceipt({
//       hash: txHash,
//     });
//     spinner.stop();

//     if (receipt.status === "success") {
//       console.log(chalk.green("✅ Transaction confirmed successfully!"));
//       console.log(
//         chalk.white(`📦 Block Number:`),
//         chalk.green(receipt.blockNumber)
//       );
//       console.log(
//         chalk.white(`⛽ Gas Used:`),
//         chalk.green(receipt.gasUsed.toString())
//       );

//       const explorerUrl = testnet
//         ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
//         : `https://explorer.rootstock.io/tx/${txHash}`;
//       console.log(
//         chalk.white(`🔗 View on Explorer:`),
//         chalk.dim(`${explorerUrl}`)
//       );
//     } else {
//       console.log(chalk.red("❌ Transaction failed."));
//     }
//   } catch (error) {
//     if (error instanceof Error) {
//       console.error(
//         chalk.red("🚨 Error during transfer:"),
//         chalk.yellow(error.message)
//       );
//     } else {
//       console.error(chalk.red("🚨 An unknown error occurred."));
//     }
//   }
// }

function getAddress(address?: Address): Address | undefined {
  if (address) {
    return validateAndFormatAddress(address);
  }

  if (!fs.existsSync(walletFilePath)) {
    console.log(chalk.red("🚫 No saved wallet found"));
    return undefined;
  }

  try {
    const { address: savedAddress } = JSON.parse(
      fs.readFileSync(walletFilePath, "utf8")
    );
    return validateAndFormatAddress(savedAddress);
  } catch (error) {
    console.log(chalk.red("⚠️ Invalid wallet data"));
    return undefined;
  }
}

export async function checkTokenBalance(
  testnet: boolean,
  contractAddress: Address,
  holderAddress?: Address
): Promise<void> {
  try {
    const formattedContractAddress = validateAndFormatAddress(contractAddress);
    if (!formattedContractAddress) {
      console.log(chalk.red("🚫 Invalid contract address"));
      return;
    }

    const targetAddress = getAddress(holderAddress);

    if (!targetAddress) {
      console.log(chalk.red("🚫 Invalid holder address"));
      return;
    }

    const provider = new ViemProvider(testnet);
    const client = await provider.getPublicClient();

    const isContract = await isValidContract(client, formattedContractAddress);
    if (!isContract) {
      console.log(
        chalk.red(
          "🚫 Contract not found. Please verify:\n   1. You're on the correct network (testnet/mainnet)\n   2. The contract address is correct"
        )
      );
      return;
    }

    const { name, symbol, decimals } = await getTokenInfo(
      provider,
      formattedContractAddress
    );

    const balance = await client.readContract({
      address: formattedContractAddress,
      abi: erc20ABI,
      functionName: "balanceOf",
      args: [targetAddress],
    });

    const formattedBalance = formatUnits(balance as bigint, decimals);

    console.log(chalk.white("📄 Token Information:"));
    console.log(chalk.white("   Name:"), chalk.green(name));
    console.log(chalk.white("   Symbol:"), chalk.green(symbol));
    console.log(chalk.white("   Contract:"), chalk.green(contractAddress));
    console.log(chalk.white("👤 Holder Address:"), chalk.green(targetAddress));
    console.log(
      chalk.white("💰 Balance:"),
      chalk.green(`${formattedBalance} ${symbol}`)
    );
    console.log(
      chalk.white("🌐 Network:"),
      chalk.green(testnet ? "Rootstock Testnet" : "Rootstock Mainnet")
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red("🚨 Error:"), chalk.yellow(error.message));
    } else {
      console.error(chalk.red("🚨 An unknown error occurred"));
    }
  }
}

export async function transferToken(
  testnet: boolean,
  tokenAddress: Address,
  toAddress: Address,
  value: string
) {
  try {
    const formattedTokenAddress = validateAndFormatAddress(tokenAddress);
    if (!formattedTokenAddress) {
      console.log(chalk.red("🚫 Invalid contract address"));
      return;
    }

    const formattedToAddress = validateAndFormatAddress(toAddress);
    if (!formattedToAddress) {
      console.log(chalk.red("🚫 Invalid recipient address"));
      return;
    }

    const fromAddress = getAddress();
    if (!fromAddress) {
      console.log(
        chalk.red("🚫 No saved wallet found. Please create a wallet first.")
      );
      return;
    }

    const provider = new ViemProvider(testnet);

    const publicClient = await provider.getPublicClient();

    const isContract = await isValidContract(
      publicClient,
      formattedTokenAddress
    );
    if (!isContract) {
      console.log(
        chalk.red(
          "🚫 Contract not found. Please verify:\n   1. You're on the correct network (testnet/mainnet)\n   2. The contract address is correct"
        )
      );
      return;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        chalk.red("🚨 Error during transfer:"),
        chalk.yellow(error.message)
      );
    } else {
      console.error(chalk.red("🚨 An unknown error occurred."));
    }
  }
}
