import { Address } from "viem";

export const TOKENS: Record<string, Record<string, Address>> = {
  RIF: {
    mainnet: "0x2acc95758f8b5F583470ba265eb685a8f45fc9d5",
    testnet: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe",
  },
  rUSDT: {
    mainnet: "0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96",
    testnet: "0x2694785f9c3006edf88df3a66ba7adf106dbd6a0",
  },
  rDoc: {
    mainnet: "0x2d919f19D4892381d58EdEbEcA66D5642ceF1A1F",
    testnet: "0x7fb303d9806a72563c46aad8d874b301419c374b",
  },
};
