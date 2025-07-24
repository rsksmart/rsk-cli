import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import ViemProvider from "../utils/viemProvider.js";
import { parseEther } from "viem/utils";

type InquirerAnswers = {
  selectedFunction?: string;
  args?: string[];
};

function isValidAddress(address: string): boolean {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

export async function ReadContract(
  uppercaseAddress: `0x${string}`,
  testnet: boolean
): Promise<void> {
  const address = uppercaseAddress.toLowerCase() as `0x${string}`;

  if (!isValidAddress(address)) {
    console.log(
      chalk.red("❌ Invalid address format. Please provide a valid address.")
    );
    return;
  }

  console.log(
    chalk.blue(
      `🔧 Initializing interaction on ${testnet ? "testnet" : "mainnet"}...`
    )
  );

  const baseUrl = testnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  console.log(
    `🔎 Checking if contract ${chalk.green(`${address}`)} is verified...`
  );

  const spinner = ora().start("Checking contract verification...");

  try {
    const response = await fetch(
      `${baseUrl}/api?module=verificationResults&action=getVerification&address=${address}`
    );

    if (!response.ok) {
      spinner.fail("❌ Error during verification check.");
      return;
    }

    const resData = await response.json();

    if (!resData.data) {
      spinner.fail("❌ Contract verification not found.");
      return;
    }

    const { abi } = resData.data;

    const readFunctions = abi.filter(
      (item: any) =>
        item.type === "function" &&
        (item.stateMutability === "view" || item.stateMutability === "pure")
    );
    const writeFunctions = abi.filter(
      (item: any) =>
        item.type === "function" &&
        (item.stateMutability === "nonpayable" || item.stateMutability === "payable")
    );

    if (readFunctions.length === 0 && writeFunctions.length === 0) {
      spinner.stop();
      console.log(chalk.yellow("⚠️ No read or write functions found in the contract."));
      return;
    }

    spinner.stop();

    const choices = [];
    if (readFunctions.length > 0) {
      choices.push(new inquirer.Separator("🔎 Read Functions"));
      choices.push(...readFunctions.map((item: any) => ({
        name: item.name,
        value: { type: "read", name: item.name }
      })));
    }
    if (writeFunctions.length > 0) {
      choices.push(new inquirer.Separator("✍️ Write Functions"));
      choices.push(...writeFunctions.map((item: any) => ({
        name: item.name,
        value: { type: "write", name: item.name }
      })));
    }

    const { selectedFunction } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedFunction",
        message: "Select a contract function to call or modify:",
        choices
      }
    ]);

    console.log(
      chalk.green(`📜 You selected: ${chalk.cyan(selectedFunction.name)}\n`)
    );

    const selectedAbiFunction =
      (selectedFunction.type === "read"
        ? readFunctions
        : writeFunctions
      ).find((item: any) => item.name === selectedFunction.name);

    let args: any[] = [];
    try {
      if (selectedAbiFunction.inputs && selectedAbiFunction.inputs.length > 0) {
        const argQuestions = selectedAbiFunction.inputs.map((input: any) => ({
          type: "input",
          name: input.name,
          message: `Enter the value for argument ${chalk.yellow(
            input.name
          )} (${chalk.yellow(input.type)}):`,
        }));

        const answers = await inquirer.prompt(argQuestions);
        args = selectedAbiFunction.inputs.map((input: any) => {
          let val = answers[input.name];
          if (input.type === "bool") {
            if (typeof val === "string") {
              if (val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "yes") return true;
              if (val.toLowerCase() === "false" || val === "0" || val.toLowerCase() === "no") return false;
            } else if (typeof val === "boolean") {
              return val;
            }
            throw new Error("Invalid boolean value. Please enter true or false.");
          }
          if (input.type === "string") {
            val = val.trim();
            if (val.length === 0) {
              throw new Error("String argument cannot be empty.");
            }
            return val;
          }
          if (input.type.endsWith("[]")) {
            return val.split(",").map((v: string) => v.trim()).filter((v: string) => v.length > 0);
          }
          return val;
        });
      }
    } catch (err: any) {
      console.log(chalk.red(`❌ ${err.message}`));
      return;
    }

    let value;
    if (selectedAbiFunction.stateMutability === "payable") {
      const { valueInput } = await inquirer.prompt([
        {
          type: "input",
          name: "valueInput",
          message: "Enter the value to send (in RBTC, e.g. 0.01):",
        },
      ]);
  
      value = parseEther(valueInput); // Converts RBTC string to wei (BigInt)
    }

    if (selectedFunction.type === "read") {
      spinner.start("⏳ Calling read function...");
      const provider = new ViemProvider(testnet);
      const publicClient = await provider.getPublicClient();
      try {
        const data = await publicClient.readContract({
          address,
          abi,
          functionName: selectedFunction.name,
          args,
        });
        spinner.stop();
        console.log(
          chalk.green(`✅ Function ${selectedFunction.name} called successfully!`)
        );
        spinner.succeed(chalk.white(`🔧 Result:`) + " " + chalk.green(data));
      } catch (error) {
        spinner.fail(
          `❌ Error while calling function ${chalk.cyan(selectedFunction.name)}.`
        );
      }
    } else {
      const provider = new ViemProvider(testnet);
      const walletClient = await provider.getWalletClient();

      if (!walletClient.account) {
        throw new Error("No account found in wallet client. Please check your wallet setup.");
      }

      try {
        spinner.start("⏳ Sending transaction (write function)...");
        const txHash = await walletClient.writeContract({
          address,
          abi,
          functionName: selectedFunction.name,
          args,
          account: walletClient.account,
          chain: provider.chain,
          ...(value !== undefined ? { value } : {}),
        });
        spinner.succeed(chalk.green(`✅ Transaction sent! Hash: ${txHash}`));
        const explorerUrl = testnet
          ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
          : `https://explorer.rootstock.io/tx/${txHash}`;
        console.log(chalk.white(`🔗 View transaction on Explorer:`), chalk.dim(explorerUrl));
      } catch (error: any) {
        spinner.fail(`❌ Error while sending transaction: ${error}`);
      }
    }

    const explorerUrl = testnet
      ? `https://explorer.testnet.rootstock.io/address/${address}`
      : `https://explorer.rootstock.io/address/${address}`;

    console.log(
      chalk.white(`🔗 View on Explorer:`),
      chalk.dim(`${explorerUrl}`)
    );
  } catch (error) {
    spinner.fail("❌ Error during contract interaction.");
  }
}