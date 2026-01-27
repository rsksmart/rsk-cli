import { Address } from "viem";

export const RNS: Record<string, Record<string, Address>> = {
  rnsRegistryAddress: {
    mainnet: "0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5",
    testnet: "0x7d284aaac6e925aad802a53c0c69efe3764597b8",
  },
  rskOwnerAddress: {
    mainnet: "0x45d3e4fb311982a06ba52359d44cb4f5980e0ef1",
    testnet: "0xca0a477e19bac7e0e172ccfd2e3c28a7200bdb71",
  },
  fifsAddrRegistrarAddress: {
    mainnet: "0xd9c79ced86ecf49f5e4a973594634c83197c35ab",
    testnet: "0x90734bd6bf96250a7b262e2bc34284b0d47c1e8d",
  },
};
