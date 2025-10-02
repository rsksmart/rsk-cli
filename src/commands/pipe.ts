import chalk from "chalk";
import { Command } from "commander";
import { transferCommand } from "./transfer.js";
import { txCommand } from "./tx.js";
import { deployCommand } from "./deploy.js";
import { verifyCommand } from "./verify.js";
import { balanceCommand } from "./balance.js";
import { Address, isAddress } from "viem";

function logMessage(message: string, color: any = chalk.white) {
  console.log(color(message));
}

function logError(message: string) {
  logMessage(`❌ ${message}`, chalk.red);
}

function logSuccess(message: string) {
  logMessage(`✅ ${message}`, chalk.green);
}

function logWarning(message: string) {
  logMessage(`⚠️  ${message}`, chalk.yellow);
}

function logInfo(message: string) {
  logMessage(`📊 ${message}`, chalk.blue);
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

export function parsePipeCommand(pipeString: string): PipeCommand[] {
  const commands: PipeCommand[] = [];
  const parts = pipeString.split('|').map(part => part.trim());
  
  for (const part of parts) {
    const command = parseCommandString(part);
    if (command) {
      commands.push(command);
    }
  }
  
  return commands;
}

function parseCommandString(commandString: string): PipeCommand | null {
  try {
    const trimmed = commandString.trim();
    if (!trimmed) {
      logWarning('Empty command string provided');
      return null;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) {
      logWarning('No command parts found');
      return null;
    }
    
    const name = parts[0];
    if (!name) {
      logError('Command name is required');
      return null;
    }

    const args: string[] = [];
    const options: Record<string, any> = {};
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.startsWith('--')) {
        const optionName = part.substring(2);
        if (!optionName) {
          logWarning('Empty option name found, skipping');
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
          logWarning('Empty short option name found, skipping');
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
    logError(`Failed to parse command string: ${error.message || error}`);
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
  inputData?: PipeableData
): Promise<PipeResult> {
  try {
    const { name, options } = command;
    
    if (!name) {
      throw new Error('Command name is required');
    }

    const pipeOptions: any = {
      ...options,
      isExternal: true,
      pipeInput: inputData
    };
    
    let result: any;
    
    switch (name) {
      case 'transfer':
        const transferAddress = inputData?.to || pipeOptions.address;
        const transferValue = inputData?.amount || pipeOptions.value;
        
        if (!transferAddress) {
          throw new Error('Transfer command requires --address option or input data with "to" field');
        }
        
        if (!transferValue) {
          throw new Error('Transfer command requires --value option or input data with "amount" field');
        }

        if (!isAddress(transferAddress)) {
          throw new Error(`Invalid address format: ${transferAddress}. Expected a valid Ethereum/Rootstock address.`);
        }

        const parsedValue = parseFloat(transferValue);
        if (isNaN(parsedValue) || parsedValue <= 0) {
          throw new Error(`Invalid transfer value: ${transferValue}. Expected a positive number.`);
        }
        
        result = await transferCommand({
          testnet: !!pipeOptions.testnet,
          toAddress: transferAddress as Address,
          value: parsedValue,
          name: pipeOptions.wallet,
          tokenAddress: pipeOptions.token as Address,
          isExternal: false 
        });
        break;
        
      case 'tx':
        const txHash = inputData?.transactionHash || pipeOptions.txid;
        if (!txHash) {
          throw new Error('Transaction hash is required for tx command');
        }

        if (!txHash.startsWith('0x') || txHash.length !== 66) {
          throw new Error(`Invalid transaction hash format: ${txHash}. Expected 64 hex characters with 0x prefix.`);
        }

        result = await txCommand({
          testnet: !!pipeOptions.testnet,
          txid: txHash,
          isExternal: false
        });
        break;
        
      case 'deploy':
        if (!pipeOptions.abi || !pipeOptions.bytecode) {
          throw new Error('Deploy command requires --abi and --bytecode options');
        }
        result = await deployCommand({
          abiPath: pipeOptions.abi,
          bytecodePath: pipeOptions.bytecode,
          testnet: !!pipeOptions.testnet,
          args: pipeOptions.args || [],
          name: pipeOptions.wallet,
          isExternal: false
        });
        break;
        
      case 'verify':
        const contractAddress = inputData?.contractAddress || pipeOptions.address;
        if (!contractAddress) {
          throw new Error('Contract address is required for verify command');
        }

        if (!isAddress(contractAddress)) {
          throw new Error(`Invalid contract address format: ${contractAddress}. Expected a valid Ethereum/Rootstock address.`);
        }

        if (!pipeOptions.json || !pipeOptions.name) {
          throw new Error('Verify command requires --json and --name options');
        }
        result = await verifyCommand({
          jsonPath: pipeOptions.json,
          address: contractAddress,
          name: pipeOptions.name,
          testnet: !!pipeOptions.testnet,
          args: pipeOptions.decodedArgs || [],
          isExternal: false
        });
        break;
        
      case 'balance':
        result = await balanceCommand({
          testnet: !!pipeOptions.testnet,
          walletName: pipeOptions.wallet,
          isExternal: false
        });
        break;
        
      default:
        throw new Error(`Unsupported command in pipe: ${name}. Supported commands: transfer, tx, deploy, verify, balance`);
    }
    
    const pipeableData = extractPipeableData(result, name);
    
    return {
      success: result.success,
      data: pipeableData || undefined,
      error: result.error
    };
    
  } catch (error: any) {
    logError(`Command execution failed: ${error.message || error}`);
    return {
      success: false,
      error: error.message || 'Unknown error in pipe command'
    };
  }
}

export async function pipeCommand(pipeString: string): Promise<void> {
  try {
    if (!pipeString || !pipeString.trim()) {
      throw new Error('Pipe string is required and cannot be empty');
    }

    logInfo('Executing pipe command...');
    
    const commands = parsePipeCommand(pipeString);
    
    if (commands.length === 0) {
      throw new Error('No valid commands found in pipe string');
    }
    
    if (commands.length === 1) {
      logWarning('Only one command found. Use regular command instead of pipe.');
      return;
    }
    
    logInfo(`Found ${commands.length} commands to execute`);
    
    let currentData: PipeableData | undefined;
    let lastResult: PipeResult | undefined;
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      logInfo(`Executing command ${i + 1}/${commands.length}: ${command.name}`);
      
      const result = await executeCommand(command, currentData);
      lastResult = result;
      
      if (!result.success) {
        logError(`Command ${i + 1} failed: ${result.error}`);
        return;
      }
      
      if (result.data) {
        currentData = result.data;
        logSuccess(`Command ${i + 1} completed successfully`);
        
        if (i < commands.length - 1) {
          const nextCommand = commands[i + 1];
          if (result.data.transactionHash && nextCommand.name === 'tx') {
            logInfo(`Passing transaction hash: ${result.data.transactionHash}`);
          } else if (result.data.contractAddress && nextCommand.name === 'verify') {
            logInfo(`Passing contract address: ${result.data.contractAddress}`);
          }
        }
      }
    }
    
    logSuccess('All pipe commands completed successfully!');
    
    if (lastResult?.data) {
      logInfo('Final Result:');
      if (lastResult.data.transactionHash) {
        logMessage(`   Transaction Hash: ${lastResult.data.transactionHash}`);
      }
      if (lastResult.data.contractAddress) {
        logMessage(`   Contract Address: ${lastResult.data.contractAddress}`);
      }
      if (lastResult.data.network) {
        logMessage(`   Network: ${lastResult.data.network}`);
      }
    }
    
  } catch (error: any) {
    logError(`Pipe command failed: ${error.message || error}`);
  }
}
