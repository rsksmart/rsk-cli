import precompiled from "@rsksmart/rsk-precompiled-abis";
import chalk from "chalk";
import { formatBridgeFragments } from "../utils/index.js";
import inquirer from "inquirer";
import { ALLOWED_BRIDGE_METHODS } from "../utils/constants.js";
import ViemProvider from "../utils/viemProvider.js";
import ora from "ora";

type InquirerAnswers = {
  selectedType?: "read" | "write";
  selectedFunction?: string;
  args?: string[];
};

export async function bridgeCommand(testnet: boolean, name: string) {
  try {
    const spinner = ora();
    console.log(
      chalk.blue(
        `🔧 Initializing bridge for ${testnet ? "testnet" : "mainnet"}...`
      )
    );

    const bridge = {
      address: precompiled.bridge.address,
      abi: formatBridgeFragments(precompiled.bridge.abi),
    };

    const readOrWriteQuestion: any = [
      {
        type: "list",
        name: "selectedType",
        message: "Select the type of function you want to call:",
        choices: ["read", "write"],
      },
    ];

    const { selectedType } = await inquirer.prompt<InquirerAnswers>(
      readOrWriteQuestion
    );

    const provider = new ViemProvider(testnet);
    const publicClient = await provider.getPublicClient();

    const explorerUrl = testnet
      ? `https://explorer.testnet.rootstock.io/address/${bridge.address}`
      : `https://explorer.rootstock.io/address/${bridge.address}`;

    const functions = ALLOWED_BRIDGE_METHODS[selectedType!];

    const functionQuestion: any = [
      {
        type: "list",
        name: "selectedFunction",
        message: `Select a ${selectedType} function to call:`,
        choices: [...functions.map((item) => item)],
      },
    ];

    const { selectedFunction } = await inquirer.prompt<InquirerAnswers>(
      functionQuestion
    );

    const selectedAbiFunction = bridge.abi.find(
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

    try {
      if (selectedType === "read") {
        spinner.start(`⏳ Calling ${selectedFunction} function...`);

        const data = await publicClient.readContract({
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: selectedFunction,
          args,
        });

        spinner.stop();
        console.log(
          chalk.green(`✅ Function ${selectedFunction} called successfully!`)
        );
        spinner.succeed(chalk.white(`🔧 Result: `) + chalk.green(data));
      }

      if (selectedType === "write") {
        const walletClient = await provider.getWalletClient(name);
        const account = walletClient.account;

        console.log(chalk.blue(`🔑 Wallet account: ${account?.address}`));

        spinner.start(`⏳ Calling ${selectedFunction} function...`);

        const { request, result } = await publicClient.simulateContract({
          account,
          address: bridge.address as `0x${string}`,
          abi: bridge.abi,
          functionName: selectedFunction,
          args,
        });

        await walletClient.writeContract(request);

        spinner.stop();
        console.log(
          chalk.green(`✅ Function ${selectedFunction} called successfully!`)
        );
        if (result) {
          spinner.succeed(chalk.white(`🔧 Result: `) + chalk.green(result));
        }
      }

      console.log(
        chalk.white(`🔗 View on Explorer:`),
        chalk.dim(`${explorerUrl}`)
      );
    } catch (error: any) {
      spinner.fail(
        `❌ Error while calling function ${chalk.cyan(selectedFunction)}.`
      );
      console.error(chalk.yellow(error.message || error));
      return;
    }
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error interacting with the bridge: "),
      chalk.yellow(error.message || error)
    );
  }
}
