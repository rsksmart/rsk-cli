# RSK CLI Write

A command-line interface tool for interacting with the RSK blockchain, supporting write operations on smart contracts.

## Key Features

- ✅ Write to any verified smart contract (ABI automatically fetched from Rootstock/Blockscout explorers)
- ✅ Supports dynamic arguments for contract functions
- ✅ Enhanced error handling beyond ethers.js defaults (parameter validation, count checking, boolean validation)
- ✅ Built-in support for RSK Testnet and Mainnet

## Setup

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

## Wallet Management

> **Important:**
>
> You need to save a wallet before execute 'rsk-cli write' command.
> If the optional command `--wallet walletname` is not added then the default wallet will be loaded

## Usage

### Call a Write Function on a Smart Contract

```bash
rsk-cli write -a <contract_address> -f <function_name> -p <param1> <param2> ... [options]
```

### Options

- `-a, --address <address>` - Contract address (required)
- `-f, --function <name>` - Function name to call (required)
- `-p, --params <params...>` - Function parameters (required)
- `-t, --testnet` - Use testnet (optional, defaults to mainnet)
- `--wallet <name>` - Wallet name to use (optional)
- `-g, --gas-limit <limit>` - Gas limit for the transaction (optional)
- `--priority-fee <fee>` - Priority fee in gwei (optional)
- `--rpc-url <url>` - Custom RPC URL (optional)

## Examples

### Basic Usage

> In these examples we are using a verified smart contract in blockscout. You can use this or another smart contract verified in rootstock oficial testnet/mainet explorer or blockscout one.

```bash
# 1. setStoredData (uint256)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setStoredData -p 42 -t --wallet testing --rpc-url https://rootstock-testnet.g.alchemy.com/v2/youralchemyapikey

# 2. setStoredString (string)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setStoredString -p "Hello RSK" -t

# 3. setStoredAddress (address)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setStoredAddress -p 0x49D41C80A2aE51e8863c9ebe36DCB955cF518B5f -t --wallet testing --rpc-url https://rootstock-testnet.g.alchemy.com/v2/youralchemyapikey

# 4. setStoredBool (bool)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setStoredBool -p true -t --wallet testing --rpc-url https://rootstock-testnet.g.alchemy.com/v2/youralchemyapikey

# 5. setAllData (multiple parameters)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setAllData -p 123 "Test String" 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc true -t --wallet testing --rpc-url https://rootstock-testnet.g.alchemy.com/v2/youralchemyapikey
```

## Error Handling

> **Note:** Our custom error handling is designed to add validation that ethers.js doesn't support natively, such as parameter count validation and boolean parameter validation. This improves the customer experience by catching errors early with clear, actionable messages. Type conversion errors (like passing strings to number parameters) are handled automatically by ethers.js and will show appropriate error messages.

### Parameter Validation Errors

```bash
# 1. Parameter count mismatch
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setAllData -p 123 "Test String" -t --wallet testing
# Error: ❌ Parameter count mismatch for function 'setAllData'.
#        📋 Expected: 4 parameter(s)
#        📤 Received: 2 parameter(s)
#        📝 Function signature: setAllData(uint256,string,address,bool)

# 2. Invalid boolean parameter
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f setStoredBool -p "notabool" -t
# Error: ❌ Parameter 1 ('value') for function 'setStoredBool' must be 'true' or 'false' (case-insensitive). Received: 'notabool'

# 3. Invalid contract address
rsk-cli write -a 0x123 -f setStoredData -p 42 -t --wallet testing
# Error: ❌ Invalid contract address: "0x123". Please provide a valid Ethereum address (0x followed by 40 hexadecimal characters).
```

### Function and Contract Errors

```bash
# 1. Non-existent function
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f nonExistentFunction -p 5 -t
# Error: ❌ Function 'nonExistentFunction' does not exist on the contract.

# 2. Read-only function (should use 'rsk-cli contract' instead)
rsk-cli write -a 0xfe943c95f1bffae8ce20f16ce390bd12452bdfdc -f getStoredData -p 5 -t
# Error: ❌ Cannot call read-only function with write command. Use "rsk-cli contract" for read operations.
```
