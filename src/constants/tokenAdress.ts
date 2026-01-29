import { Address } from "viem";

export const TOKENS: Record<string, Record<string, Address>> = {
  RIF: {
    mainnet: "0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D5",
    testnet: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe",
  },
  USDRIF: {
    mainnet: "0x3A15461d8ae0f0fb5fa2629e9da7D66a794a6e37",
    testnet: "0xd1b0d1bc03491f49b9aea967ddd07b37f7327e63",
  },
  DoC: {
    mainnet: "0xe700691da7B9851f2f35f8b8182c69c53ccad9db",
    testnet: "0xd37a3e5874be2dc6c732ad21c008a1e4032a6040",
  },
};

export const TOKENS_METADATA = {
  RIF: {
    mainnet: "RIF",
    testnet: "tRIF",
    faucet : {link : "https://faucet.rootstock.io/"}
  },
  RBTC: {
    mainnet: "rBTC",
    testnet: "tRBTC",
    faucet : {link : "https://faucet.rifos.org/"},
  },
} as const;
