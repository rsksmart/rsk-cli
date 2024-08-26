# rsk-cli

## Description

`rsk-cli` is a command-line tool for interacting with Rootstock blockchain 

## Installation

To install the CLI tool globally, use the following command:

```bash
npm install -g rsk-cli
```

## Development

### Prerequisites

Before you can start developing with `rsk-cli`, ensure that you have the following tools installed on your system:

1. **Node.js**: Make sure Node.js is installed, as it is required for running the CLI tool.
2. **Bun**: Bun is a fast JavaScript runtime that the CLI uses for development. To install Bun, run the following command:
    
    ```bash
    curl -fsSL https://bun.sh/install | bash
    ```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun bin/index.ts
```

## Features

### 1. Manage Wallet

The `wallet` command allows you to manage your wallet on the Rootstock blockchain. You can create a new wallet, use an existing wallet, or import a custom wallet.

```bash
rsk-cli wallet
```

This command will guide you through the process of wallet management, offering options to:

- Create a new Ethereum-compatible wallet
- Use an existing wallet
- Import a custom wallet

> **ℹ️ Info:**
> 
> When you choose to save a wallet using `rsk-cli`, your private key is securely encrypted to protect it from unauthorized access.
>
> The tool uses AES-256-CBC encryption, a robust encryption standard. Your password is used to derive a strong encryption key through the `scrypt` function, ensuring that even weak passwords result in strong keys. A random Initialization Vector (IV) is also generated to ensure that even if the same data is encrypted multiple times, the output will be different each time.
>
> After encryption, your wallet's private key, along with the necessary encryption metadata, is securely stored in a file named `rootstock-wallet.json` in the current working directory. This file allows you to manage and reuse your wallets securely within `rsk-cli` without exposing your sensitive private keys.


Example output when creating a new wallet:

```
Wallet created successfully on Rootstock!
Address: 0x63281026e39bCa0F6B371a354ae3b0c79AC1e93B
Private Key: 0xc5b8b8d70f5afb837f85698b5c8360b1af821f590dfe302af8cba465465fcbd6
Please save the private key in a secure location.
```

### 2. Check Balance

The `balance` command allows you to check the balance of your saved wallet on the Rootstock blockchain. You can check the balance on either the mainnet or testnet using the appropriate flags.

#### Mainnet

```bash
rsk-cli balance
```

Output example:

```
📄 Wallet Address: 0x08C4E4BdAb2473E454B8B2a4400358792786d341
🌐 Network: Rootstock Testnet
💰 Current Balance: 0.5015843199087592 RBTC
🔗 Ensure that transactions are being conducted on the correct network.
```

#### Testnet

Use the `-t` or `--testnet` flag to check the balance on the Rootstock testnet.

```bash
rsk-cli balance -t
```

Output example:

```
Balance on testnet: 0.6789 RBTC
```

### 3. Transfer rBTC

The `transfer` command allows you to transfer rBTC from your saved wallet to a specified address on the Rootstock blockchain. You can execute the transfer on either the mainnet or testnet using the appropriate flags.

#### Mainnet

```bash
rsk-cli transfer --address 0xRecipientAddress --value 0.001
```

#### Testnet

Use the `-t` or `--testnet` flag to execute the transfer on the Rootstock testnet.

```bash
rsk-cli transfer --testnet --address 0x0x08C4E4BdAb2473E454B8B2a4400358792786d341 --value 0.001
```

Output example:

```
📄 Wallet Address: 0x08C4E4BdAb2473E454B8B2a4400358792786d341
🎯 Recipient Address: 0x08C4E4BdAb2473E454B8B2a4400358792786d341
💵 Amount to Transfer: 0.001 RBTC
💰 Current Balance: 0.5015859620415593 RBTC
? Enter your password to decrypt the wallet: ****
🔄 Transaction initiated. TxHash: 0x0d27447f00c7de5b891d235268fc1e0b350ab46626aa93f8fb41f2cf9acb6a84
✅ Transaction confirmed successfully!
📦 Block Number: 5473422
⛽ Gas Used: 21000
🔗 View on Explorer: https://rootstock-testnet.blockscout.com/tx/0x0d27447f00c7de5b891d235268fc1e0b350ab46626aa93f8fb41f2cf9acb6a84
```

### 4. Check Transaction Status

The `tx` command allows you to check the status of a specific transaction on the Rootstock blockchain by providing the transaction ID. You can check the status on either the mainnet or testnet using the appropriate flags.

#### Mainnet

```bash
rsk-cli tx --txid 0x86deb77e1d666ae6848630496d672da8b5f48292681bda33f8f04245c55dde26
```

#### Testnet

```bash
rsk-cli tx --testnet --txid 0x86deb77e1d666ae6848630496d672da8b5f48292681bda33f8f04245c55dde26
```

Output example:
```
📄 Wallet Address: 0x08C4E4BdAb2473E454B8B2a4400358792786d341
🌐 Network: Rootstock Testnet
💰 Current Balance: 0.5015859620415593 RBTC
🔗 Ensure that transactions are being conducted on the correct network.
```