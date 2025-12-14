import chalk from "chalk";
import ora from "ora";
import { transferCommand } from "./transfer.js";
import { txCommand } from "./tx.js";
import { deployCommand } from "./deploy.js";
import { verifyCommand } from "./verify.js";
import { balanceCommand } from "./balance.js";
import { Address, isAddress } from "viem";

type PipeCommandOptions = {
  isExternal?: boolean;
};

function logMessage(
  params: PipeCommandOptions | undefined,
  message: string,
  color: any = chalk.white
) {
  if (!params?.isExternal) {
    console.log(color(message));
  }
}

function logError(params: PipeCommandOptions | undefined, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: PipeCommandOptions | undefined, message: string) {
  logMessage(params, `✅ ${message}`, chalk.green);
}

function logWarning(params: PipeCommandOptions | undefined, message: string) {
  logMessage(params, `⚠️  ${message}`, chalk.yellow);
}

function logInfo(params: PipeCommandOptions | undefined, message: string) {
  logMessage(params, `📊 ${message}`, chalk.blue);
}

function startSpinner(
  params: PipeCommandOptions | undefined,
  spinner: any,
  message: string
) {
  if (!params?.isExternal) {
    spinner.start(message);
  }
}

function succeedSpinner(
  params: PipeCommandOptions | undefined,
  spinner: any,
  message: string
) {
  if (!params?.isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  params: PipeCommandOptions | undefined,
  spinner: any,
  message: string
) {
  if (!params?.isExternal) {
    spinner.fail(message);
  }
}

export type PipeableData = {
  transactionHash?: string;
  contractAddress?: string;
  [key: string]: any;
};

export type PipeCommand = {
  name: string;
  args: string[];
  options: Record<string, any>;
};

export type PipeResult = {
  success: boolean;
  data?: PipeableData;
  error?: string;
};

export function parsePipeCommand(pipeString: string, params?: PipeCommandOptions): PipeCommand[] {
  const commands: PipeCommand[] = [];
  const parts = pipeString.split('|').map(part => part.trim());
  
  for (const part of parts) {
    const command = parseCommandString(part, params);
    if (command) {
      commands.push(command);
    }
  }
  
  return commands;
}

function parseCommandString(commandString: string, params?: PipeCommandOptions): PipeCommand | null {
  try {
    const trimmed = commandString.trim();
    if (!trimmed) {
      logWarning(params, 'Empty command string provided');
      return null;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) {
      logWarning(params, 'No command parts found');
      return null;
    }
    
    const name = parts[0];
    if (!name) {
      logError(params, 'Command name is required');
      return null;
    }

    const args: string[] = [];
    const options: Record<string, any> = {};
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.startsWith('--')) {
        const optionName = part.substring(2);
        if (!optionName) {
          logWarning(params, 'Empty option name found, skipping');
          continue;
        }
        
        const nextPart = parts[i + 1];
        
        if (nextPart && !nextPart.startsWith('-')) {
          options[optionName] = nextPart;
          i++; 
        } else {
          options[optionName] = true;
        }
      } else if (part.startsWith('-') && part.length === 2) {
        const optionName = part.substring(1);
        if (!optionName) {
          logWarning(params, 'Empty short option name found, skipping');
          continue;
        }
        
        const nextPart = parts[i + 1];
        
        if (nextPart && !nextPart.startsWith('-')) {
          options[optionName] = nextPart;
          i++; 
        } else {
          options[optionName] = true;
        }
      } else {
        args.push(part);
      }
    }
    
    return { name, args, options };
  } catch (error: any) {
    logError(params, `Failed to parse command string: ${error.message || error}`);
    return null;
  }
}

export function extractPipeableData(result: any, commandName: string): PipeableData | null {
  if (!result || !result.success || !result.data) {
    return null;
  }
  
  const data = result.data;
  
  switch (commandName) {
    case 'transfer':
      return {
        transactionHash: data.transactionHash,
        from: data.from,
        to: data.to,
        amount: data.amount,
        token: data.token,
        network: data.network
      };
    
    case 'deploy':
      return {
        contractAddress: data.contractAddress,
        transactionHash: data.transactionHash,
        network: data.network
      };
    
    case 'tx':
      return {
        transactionHash: data.txId,
        blockHash: data.blockHash,
        blockNumber: data.blockNumber,
        status: data.status,
        from: data.from,
        to: data.to,
        network: data.network
      };
    
    case 'verify':
      return {
        contractAddress: data.contractAddress,
        contractName: data.contractName,
        verified: data.verified,
        network: data.network
      };
    
    case 'balance':
      return {
        balance: data.balance,
        address: data.address,
        network: data.network,
        token: data.token
      };
    
    default:
      return data;
  }
}

async function executeCommand(
  command: PipeCommand,
  inputData: PipeableData | undefined,
  params?: PipeCommandOptions
): Promise<PipeResult> {
  const { name, options } = command;

  if (!name) {
    return {
      success: false,
      error: 'Command name is required'
    };
  }

  const pipeOptions: any = {
    ...options,
    isExternal: true,
    pipeInput: inputData
  };

  let result: any;

  if (name === 'transfer') {
    const transferAddress = inputData?.to || pipeOptions.address;
    const transferValue = inputData?.amount || pipeOptions.value;

    if (!transferAddress) {
      return {
        success: false,
        error: 'Transfer command requires --address option or input data with "to" field'
      };
    }

    if (!transferValue) {
      return {
        success: false,
        error: 'Transfer command requires --value option or input data with "amount" field'
      };
    }

    if (!isAddress(transferAddress)) {
      return {
        success: false,
        error: `Invalid address format: ${transferAddress}. Expected a valid Ethereum/Rootstock address.`
      };
    }

    const parsedValue = parseFloat(transferValue);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      return {
        success: false,
        error: `Invalid transfer value: ${transferValue}. Expected a positive number.`
      };
    }

    result = await transferCommand({
      testnet: !!pipeOptions.testnet,
      toAddress: transferAddress as Address,
      value: parsedValue,
      name: pipeOptions.wallet,
      tokenAddress: pipeOptions.token as Address,
      isExternal: true
    });
  } else if (name === 'tx') {
    const txHash = inputData?.transactionHash || pipeOptions.txid;
    if (!txHash) {
      return { success: false, error: 'Transaction hash is required for tx command' };
    }

    if (!txHash.startsWith('0x') || txHash.length !== 66) {
      return {
        success: false,
        error: `Invalid transaction hash format: ${txHash}. Expected 64 hex characters with 0x prefix.`
      };
    }

    result = await txCommand({
      testnet: !!pipeOptions.testnet,
      txid: txHash,
      isExternal: true
    });
  } else if (name === 'deploy') {
    if (!pipeOptions.abi || !pipeOptions.bytecode) {
      return { success: false, error: 'Deploy command requires --abi and --bytecode options' };
    }
    result = await deployCommand({
      abiPath: pipeOptions.abi,
      bytecodePath: pipeOptions.bytecode,
      testnet: !!pipeOptions.testnet,
      args: pipeOptions.args || [],
      name: pipeOptions.wallet,
      isExternal: true
    });
  } else if (name === 'verify') {
    const contractAddress = inputData?.contractAddress || pipeOptions.address;
    if (!contractAddress) {
      return { success: false, error: 'Contract address is required for verify command' };
    }

    if (!isAddress(contractAddress)) {
      return {
        success: false,
        error: `Invalid contract address format: ${contractAddress}. Expected a valid Ethereum/Rootstock address.`
      };
    }

    if (!pipeOptions.json || !pipeOptions.name) {
      return { success: false, error: 'Verify command requires --json and --name options' };
    }
    result = await verifyCommand({
      jsonPath: pipeOptions.json,
      address: contractAddress,
      name: pipeOptions.name,
      testnet: !!pipeOptions.testnet,
      args: pipeOptions.decodedArgs || [],
      isExternal: true
    });
  } else if (name === 'balance') {
    result = await balanceCommand({
      testnet: !!pipeOptions.testnet,
      walletName: pipeOptions.wallet,
      isExternal: true
    });
  } else {
    return {
      success: false,
      error: `Unsupported command in pipe: ${name}. Supported commands: transfer, tx, deploy, verify, balance`
    };
  }

  const pipeableData = extractPipeableData(result, name);
  return {
    success: result.success,
    data: pipeableData || undefined,
    error: result.error
  };
}

export async function pipeCommand(
  pipeString: string,
  params?: PipeCommandOptions
): Promise<PipeResult> {
  if (!pipeString || !pipeString.trim()) {
    logError(params, 'Pipe string is required and cannot be empty');
    return { success: false, error: 'Pipe string is required and cannot be empty' };
  }

  const spinner = params?.isExternal ? ora({ isEnabled: false }) : ora();
  startSpinner(params, spinner, '⏳ Executing pipe command...');

  const commands = parsePipeCommand(pipeString, params);

  if (commands.length === 0) {
    failSpinner(params, spinner, 'No valid commands found');
    logError(params, 'No valid commands found in pipe string');
    return { success: false, error: 'No valid commands found in pipe string' };
  }

  if (commands.length === 1) {
    succeedSpinner(params, spinner, 'Single command detected');
    logWarning(params, 'Only one command found. Use regular command instead of pipe.');
    return { success: false, error: 'Only one command found. Use regular command instead of pipe.' };
  }

  logInfo(params, `Found ${commands.length} commands to execute`);

  let currentData: PipeableData | undefined;
  let lastResult: PipeResult | undefined;

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    startSpinner(params, spinner, `⏳ Executing ${command.name} (${i + 1}/${commands.length})...`);

    const result = await executeCommand(command, currentData, params);
    lastResult = result;

    if (!result.success) {
      failSpinner(params, spinner, `Error in ${command.name}`);
      logError(params, `Command ${i + 1} failed: ${result.error}`);
      return { success: false, error: result.error };
    }

    succeedSpinner(params, spinner, `${command.name} completed`);

    if (result.data) {
      currentData = result.data;
      logSuccess(params, `Command ${i + 1} completed successfully`);

      if (i < commands.length - 1) {
        const nextCommand = commands[i + 1];
        if (result.data.transactionHash && nextCommand.name === 'tx') {
          logInfo(params, `Passing transaction hash: ${result.data.transactionHash}`);
        } else if (result.data.contractAddress && nextCommand.name === 'verify') {
          logInfo(params, `Passing contract address: ${result.data.contractAddress}`);
        }
      }
    }
  }

  succeedSpinner(params, spinner, '✅ All pipe commands completed successfully');
  logSuccess(params, 'All pipe commands completed successfully!');

  if (lastResult?.data) {
    logInfo(params, 'Final Result:');
    if (lastResult.data.transactionHash) {
      logMessage(params, `   Transaction Hash: ${lastResult.data.transactionHash}`);
    }
    if (lastResult.data.contractAddress) {
      logMessage(params, `   Contract Address: ${lastResult.data.contractAddress}`);
    }
    if (lastResult.data.network) {
      logMessage(params, `   Network: ${lastResult.data.network}`);
    }
  }

  return { success: true, data: lastResult?.data };
}
