import { Command } from 'commander';
import { deployERC20 } from './erc20.js';
import { deployERC721 } from './erc721.js';
import { deployCustomContract } from './deploy-custom.js';
import { ipfsStorage } from './ipfs.js';
import { mintTokens } from './mint.js';
import { checkBalance } from './balance.js';
import { checkNFTBalance } from './nft-balance.js';
import { mintNFT } from './mint-nft.js';
import { transferNFT } from './transfer-nft.js';
import { transferTokens } from './transfer.js';

export const thirdwebCommand = new Command()
  .name('thirdweb')
  .description('Thirdweb commands for deploying and managing tokens')
  .addCommand(deployERC20)
  .addCommand(deployERC721)
  .addCommand(deployCustomContract)
  .addCommand(ipfsStorage)
  .addCommand(mintTokens)
  .addCommand(checkBalance)
  .addCommand(checkNFTBalance)
  .addCommand(mintNFT)
  .addCommand(transferNFT)
  .addCommand(transferTokens); 