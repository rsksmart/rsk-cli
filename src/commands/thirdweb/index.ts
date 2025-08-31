import { Command } from 'commander';
import { deployERC20 } from './erc20.js';
import { deployERC721 } from './erc721.js';
import { deployCustomContract } from './deploy-custom.js';
import { checkBalance } from './balance.js';
import { mintTokens } from './mint.js';
import { transferTokens } from './transfer.js';
import { checkNFTBalance } from './nft-balance.js';
import { mintNFT } from './mint-nft.js';
import { transferNFT } from './transfer-nft.js';
import { ipfsCommand } from './ipfs.js';

export { deployERC20 } from './erc20.js';
export { deployERC721 } from './erc721.js';
export { deployCustomContract } from './deploy-custom.js';
export { checkBalance } from './balance.js';
export { mintTokens } from './mint.js';
export { transferTokens } from './transfer.js';
export { checkNFTBalance } from './nft-balance.js';
export { mintNFT } from './mint-nft.js';
export { transferNFT } from './transfer-nft.js';
export { ipfsCommand } from './ipfs.js';

export const thirdwebCommand = new Command()
  .name('thirdweb')
  .description('Thirdweb integration commands for deploying and managing tokens and NFTs')
  .addCommand(deployERC20)
  .addCommand(deployERC721)
  .addCommand(deployCustomContract)
  .addCommand(checkBalance)
  .addCommand(mintTokens)
  .addCommand(transferTokens)
  .addCommand(checkNFTBalance)
  .addCommand(mintNFT)
  .addCommand(transferNFT)
  .addCommand(ipfsCommand); 