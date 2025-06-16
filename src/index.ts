import { Command } from 'commander';
import { deployERC20 } from './commands/thirdweb/erc20';
import { deployERC721 } from './commands/thirdweb/erc721';
import { mintTokens } from './commands/thirdweb/mint';

const program = new Command();

// Add thirdweb commands
program.addCommand(deployERC20);
program.addCommand(deployERC721);
program.addCommand(mintTokens);

program.parse(process.argv); 