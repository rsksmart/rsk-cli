# Attestations Feature

The RSK CLI supports creating on-chain attestations for transfers using the Ethereum Attestation Service (EAS) deployed on Rootstock.

## Overview

Attestations provide cryptographic proof and additional metadata about blockchain transactions. They are stored on-chain and can be queried and verified by anyone.

## RSK EAS Contract Addresses

### Testnet
- EAS Contract: `0xc300aeEaDd60999933468738c9F5D7e9C0671e1c`
- Schema Registry: `0x679c62956cD2801AbAbF80e9D430f18859Eea2d5`

### Mainnet
- EAS Contract: `0x54C0726E9d2D57Bc37AD52c7E219A3229e0eE963`
- Schema Registry: `0xeF29675d82CC5967069d6d9C17F2719f67728F5B`

## Usage

### Transfer Attestations

Create attestations when transferring RBTC or tokens on testnet:

```bash
# Interactive transfer with attestation
node dist/bin/index.js transfer --testnet -i --attest-transfer

# Direct transfer with attestation
node dist/bin/index.js transfer \
  --testnet \
  --address 0x... \
  --value 0.001 \
  --attest-transfer \
  --attest-reason "Payment for services"

# Token transfer with attestation
node dist/bin/index.js transfer \
  --testnet \
  --token 0x... \
  --address 0x... \
  --value 10 \
  --attest-transfer
```

### Deployment Attestations

Create attestations when deploying contracts:

```bash
node dist/bin/index.js deploy \
  --testnet \
  --abi path/to/abi.json \
  --bytecode 0x... \
  --attest-deployment \
  --attest-schema-uid <SCHEMA_UID>
```

### Verification Attestations

Create attestations when verifying contracts:

```bash
node dist/bin/index.js verify \
  --testnet \
  --contract 0x... \
  --attest-verification \
  --attest-schema-uid <SCHEMA_UID>
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--attest-transfer` | Enable attestation for transfers |
| `--attest-deployment` | Enable attestation for deployments |
| `--attest-verification` | Enable attestation for verifications |
| `--attest-schema-uid <UID>` | Schema UID (required for all attestation types) |
| `--attest-recipient <address>` | Custom attestation recipient (optional) |
| `--attest-reason <text>` | Reason for transfer (optional) |

## Schema Information

### Transfer Schema

**Note:** You must register a schema and provide its UID using `--attest-schema-uid <UID>` when creating transfer attestations.

**Schema Definition:**
```
address sender,address recipient,string amount,address tokenAddress,string tokenSymbol,bytes32 transactionHash,uint256 blockNumber,uint256 timestamp,string reason,string transferType
```

**Description:**
- `sender`: Address that sent the transfer
- `recipient`: Address that received the transfer
- `amount`: Amount transferred (as string to preserve precision)
- `tokenAddress`: Address of the token contract (0x0 for RBTC)
- `tokenSymbol`: Symbol of the token (e.g., "RBTC", "RIF")
- `transactionHash`: Transaction hash of the transfer
- `blockNumber`: Block number when the transfer occurred
- `timestamp`: Unix timestamp of the transfer
- `reason`: Optional reason for the transfer
- `transferType`: Type of transfer (e.g., "RBTC", "ERC20")

### Deployment Schema

**Note:** You must register a schema and provide its UID using `--attest-schema-uid <UID>` when creating deployment attestations.

**Schema Definition:**
```
string contractName,address contractAddress,address deployer,uint256 blockNumber,bytes32 transactionHash,uint256 timestamp,string abiHash,string bytecodeHash
```

**Description:**
- `contractName`: Name of the deployed contract
- `contractAddress`: Address where the contract was deployed
- `deployer`: Address that deployed the contract
- `blockNumber`: Block number when the contract was deployed
- `transactionHash`: Transaction hash of the deployment
- `timestamp`: Unix timestamp of the deployment
- `abiHash`: Keccak256 hash of the contract ABI
- `bytecodeHash`: Keccak256 hash of the contract bytecode

### Verification Schema

**Note:** You must register a schema and provide its UID using `--attest-schema-uid <UID>` when creating verification attestations.

**Schema Definition:**
```
string contractName,address contractAddress,address verifier,string sourceCodeHash,string compilationTarget,string compilerVersion,bool optimizationUsed,uint256 timestamp,string verificationTool
```

**Description:**
- `contractName`: Name of the verified contract
- `contractAddress`: Address of the verified contract
- `verifier`: Address that performed the verification
- `sourceCodeHash`: Hash of the verified source code
- `compilationTarget`: Compilation target (e.g., "contracts/MyContract.sol:MyContract")
- `compilerVersion`: Solidity compiler version used
- `optimizationUsed`: Whether optimization was enabled during compilation
- `timestamp`: Unix timestamp of the verification
- `verificationTool`: Tool used for verification (e.g., "rsk-cli")

## How to Register Schemas

Before you can create attestations, you must register the appropriate schema on the RSK Attestation Service. Schema registration is an on-chain operation that requires RBTC for gas fees.

### Using the Rootstock Explorer

1. Visit the Rootstock Explorer attestation service:
   - Testnet: [https://explorer.testnet.rootstock.io/ras](https://explorer.testnet.rootstock.io/ras)
   - Mainnet: [https://explorer.rootstock.io/ras](https://explorer.rootstock.io/ras)

2. Navigate to the "Schemas" section

3. Click "Create Schema +" button

4. Enter your schema definition using one of the structures documented above

5. Submit the transaction (you'll need RBTC for gas fees)

6. Copy the returned Schema UID

7. Use the Schema UID with the `--attest-schema-uid` flag when creating attestations

### Using the Schema Registry Contract Directly

Alternatively, you can interact directly with the Schema Registry contract:

**Testnet:** `0x679c62956cD2801AbAbF80e9D430f18859Eea2d5`
**Mainnet:** `0xeF29675d82CC5967069d6d9C17F2719f67728F5B`

### Example: Registering a Transfer Schema

1. Go to [https://explorer.testnet.rootstock.io/ras](https://explorer.testnet.rootstock.io/ras)
2. Navigate to the Schemas section and click "Create Schema +"
3. Enter the transfer schema definition:
   ```
   address sender,address recipient,string amount,address tokenAddress,string tokenSymbol,bytes32 transactionHash,uint256 blockNumber,uint256 timestamp,string reason,string transferType
   ```
4. Set revocable to `true` (recommended for flexibility)
5. Submit the transaction and wait for confirmation
6. Copy the returned Schema UID (e.g., `0x1234...`)
7. Use it in your transfer command:
   ```bash
   node dist/bin/index.js transfer \
     --testnet \
     --address 0x... \
     --value 0.001 \
     --attest-transfer \
     --attest-schema-uid 0x1234...
   ```

## MCP Server Integration

When using this CLI as an MCP server, attestations are fully supported with automatic logging suppression for clean JSON responses.

## Resources

- [Rootstock Attestation Service Documentation](https://dev.rootstock.io/dev-tools/attestations/ras/)
- [Ethereum Attestation Service](https://docs.attest.org/)
- [RSK Explorer](https://explorer.rootstock.io/)

## Notes

- **All attestation types require a registered schema UID** - there are no default schemas
- Schema UIDs must match the exact data structure for the attestation type
- All attestations incur additional gas costs
- Attestations are permanent and immutable on-chain
- Each attestation type (transfer, deployment, verification) requires its own specific schema
