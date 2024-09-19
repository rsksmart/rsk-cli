import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import ViemProvider from "../utils/viemProvider.js";

type InquirerAnswers = {
  selectedFunction?: string;
  args?: string[];
};

function isValidAddress(address: string): boolean {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

export async function ReadContract(
  address: `0x${string}`,
  testnet: boolean
): Promise<void> {
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

    if (readFunctions.length === 0) {
      console.log(chalk.yellow("⚠️ No read functions found in the contract."));
      return;
    }

    spinner.stop();

    const questions: any = [
      {
        type: "list",
        name: "selectedFunction",
        message: "Select a read function to call:",
        choices: [...readFunctions.map((item: any) => item.name)],
      },
    ];

    const { selectedFunction } = await inquirer.prompt<InquirerAnswers>(
      questions
    );

    console.log(
      chalk.green(`📜 You selected: ${chalk.cyan(selectedFunction)}\n`)
    );

    const selectedAbiFunction = readFunctions.find(
      (item: any) => item.name === selectedFunction
    );

    let args: any[] = [];
    if (selectedAbiFunction.inputs && selectedAbiFunction.inputs.length > 0) {
      const argQuestions = selectedAbiFunction.inputs.map((input: any) => ({
        type: "input",
        name: input.name,
        message: `Enter the value for argument ${chalk.yellow(
          input.name
        )} (${chalk.yellow(input.type)}):`,
      }));

      const answers = await inquirer.prompt(argQuestions);
      args = selectedAbiFunction.inputs.map(
        (input: any) => answers[input.name]
      );
    }

    spinner.start("⏳ Calling read function...");

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();

    try {
      const data = await publicClient.readContract({
        address,
        abi,
        functionName: selectedFunction,
        args,
      });

      spinner.stop();
      console.log(
        chalk.green(`✅ Function ${selectedFunction} called successfully!`)
      );
      spinner.succeed(chalk.white(`🔧 Result:`) + " " + chalk.green(data));
    } catch (error) {
      console.error(
        chalk.red(`❌ Error calling function ${selectedFunction}:`),
        error
      );
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
    throw error;
  }
}
