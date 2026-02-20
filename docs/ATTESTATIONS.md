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
  --attest-deployment
```

### Verification Attestations

Create attestations when verifying contracts:

```bash
node dist/bin/index.js verify \
  --testnet \
  --contract 0x... \
  --attest-verification
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--attest-transfer` | Enable attestation for transfers |
| `--attest-deployment` | Enable attestation for deployments |
| `--attest-verification` | Enable attestation for verifications |
| `--attest-schema-uid <UID>` | Custom schema UID (optional on testnet, required on mainnet) |
| `--attest-recipient <address>` | Custom attestation recipient (optional) |
| `--attest-reason <text>` | Reason for transfer (optional) |

## Schema Information

### Testnet Default Schemas

Testnet has pre-registered default schemas for all attestation types. You can use attestations without specifying a schema UID:

- **Transfer Schema UID**: `0x0da2422c401f8810a6be8f4451aaa0c0a5a6601701cba17bba14f50bb0039dc8`
- **Deployment Schema UID**: `0xac72a47948bf42cad950de323c51a0033346629ae4a42da45981ae9748118a72`
- **Verification Schema UID**: `0xdf68ba5414a61a12f26d41df4f5a1ef3ffe2ab809fea94d9c76fa7cb84b8fb4a`

### Mainnet Schemas

Mainnet currently has no default schemas. You must register your own schema and provide its UID using `--attest-schema-uid <UID>`.

### Transfer Schema

**Schema Definition:**
```
address sender,address recipient,string amount,address tokenAddress,string tokenSymbol,bytes32 transactionHash,uint256 blockNumber,uint256 timestamp,string reason,string transferType,string version
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
- `version`: Schema version identifier (e.g., "1.0")

### Deployment Schema

**Schema Definition:**
```
string contractName,address contractAddress,address deployer,uint256 blockNumber,bytes32 transactionHash,uint256 timestamp,string abiHash,string bytecodeHash,string version
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
- `version`: Schema version identifier (e.g., "1.0")

### Verification Schema

**Schema Definition:**
```
string contractName,address contractAddress,address verifier,string sourceCodeHash,string compilationTarget,string compilerVersion,bool optimizationUsed,uint256 timestamp,string verificationTool,string version,string schemaVersion
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
- `version`: Schema version identifier (e.g., "1.0")
- `schemaVersion`: Schema revision identifier (e.g., "2.0")

## How to Register Schemas (Mainnet Only)

For mainnet deployments, you must register schemas before creating attestations. Schema registration is an on-chain operation that requires RBTC for gas fees.

### Using EAS Scan

1. Visit [https://easscan.org/schema/create](https://easscan.org/schema/create)

2. Connect your wallet and select the Rootstock network

3. Enter your schema definition using one of the structures documented above

4. Set revocable to `true` (recommended for flexibility)

5. Submit the transaction (you'll need RBTC for gas fees)

6. Copy the returned Schema UID

7. Use the Schema UID with the `--attest-schema-uid` flag when creating attestations

### Using the Schema Registry Contract Directly

Alternatively, you can interact directly with the Schema Registry contract at `0xeF29675d82CC5967069d6d9C17F2719f67728F5B`.

## MCP Server Integration

When using this CLI as an MCP server, attestations are fully supported with automatic logging suppression for clean JSON responses.

## Resources

- [Rootstock Attestation Service Documentation](https://dev.rootstock.io/dev-tools/attestations/ras/)
- [Ethereum Attestation Service](https://docs.attest.org/)
- [RSK Explorer](https://explorer.rootstock.io/)

## Notes

- Testnet uses default schemas - no schema UID required
- Mainnet requires schema registration and the `--attest-schema-uid` flag
- All attestations incur additional gas costs
- Attestations are permanent and immutable on-chain