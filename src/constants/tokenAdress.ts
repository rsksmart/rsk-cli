import { Address } from "viem";

export const TOKENS: Record<string, Record<string, Address>> = {
  RIF: {
    mainnet: "0x2acc95758f8b5F583470ba265eb685a8f45fc9d5",
    testnet: "0xC370cD19517b5A8a9f6dF0958679e8cd4874C048",
  },
  rUSDT: {
    mainnet: "0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96",
    testnet: "0x31974a4970BAda0ca9bCdE2e2EE6FC15922c5334",
  },
  rDoc: {
    mainnet: "0x2d919f19D4892381d58EdEbEcA66D5642ceF1A1F",
    testnet: "0x7fb303D9806a72563C46aAd8D874B301419c374b",
  },
};
