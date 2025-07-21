[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/rsksmart/rsk-cli/badge)](https://scorecard.dev/viewer/?uri=github.com/rsksmart/rsk-cli)
[![CodeQL](https://github.com/rsksmart/rskj/workflows/CodeQL/badge.svg)](https://github.com/rsksmart/rsk-cli/actions?query=workflow%3ACodeQL)

<img src="rootstock-logo.png" alt="RSK Logo" style="width:100%; height: auto;" />

# rsk-cli

## Description

`rsk-cli` is a command-line tool for interacting with Rootstock blockchain

## Installation

To install the CLI tool globally, use the following command:

```bash
npm i -g @rsksmart/rsk-cli
```

## Development

### Prerequisites

Before you can start developing with `rsk-cli`, ensure that you have the following tools installed on your system:

- **Node.js**: Make sure Node.js is installed, as it is required for running the CLI tool.

## Features

### 1. Manage Wallet

The `wallet` command allows you to manage your wallet on the Rootstock blockchain. You can create a new wallet, use an existing wallet, or import a custom wallet.

```bash
rsk-cli wallet
```

This command will guide you through the process of wallet management, offering options to:

- Create a new Ethereum-compatible wallet
- Import an existing wallet
- List all saved wallets
- Switch between saved wallets
- Update a wallet's name
- Backup the wallet's file
- Delete a saved wallet

> **ℹ️ Info:**
>
> When you choose to save a wallet using `rsk-cli`, your private key is securely encrypted to protect it from unauthorized access.
>
> The tool uses AES-256-CBC encryption, a robust encryption standard. Your password is used to derive a strong encryption key through the `scrypt` function, ensuring that even weak passwords result in strong keys. A random Initialization Vector (IV) is also generated to ensure that even if the same data is encrypted multiple times, the output will be different each time.
>
> After encryption, your wallet's private key, along with the necessary encryption metadata, is securely stored in a file named `rootstock-wallet.json` in the current working directory. This file allows you to manage and reuse your wallets securely within `rsk-cli` without exposing your sensitive private keys.

- Example output when creating a new wallet:

  ```
  🎉 Wallet created successfully on Rootstock!
  ? 🔒 Enter a password to encrypt your wallet: ****
  ? 🖋️ Enter a name for your wallet: firstWallet
  📄 Address: 0x443Cdb69aDA3B9Ca617cc14763FBA57bfB82fd00
  🔑 Private Key: <PRIVATE_KEY>
  🔒 Please save the private key in a secure location.
  💾 Wallet saved securely at /path/to/package/rootstock-wallet.json
  ```

- Example output when importing an existing wallet:

  ```
  ? 🔑 Enter your private key: ****************************************************************
  ? 🖋️ Enter a name for your wallet: imported
  ? 🔒 Enter a password to encrypt your wallet: ****
  ? 🔍 Would you like to set this as the current wallet? yes
  ✅ Wallet set as current!
  ✅ Wallet validated successfully!
  📄 Address: 0x4913AbCD40a9455a28134b4ccc37f4f95225e593
  💾 Wallet saved securely at /path/to/package/rootstock-wallet.json
  ```

- Example output when listing all saved wallets:

  ```
  📜 Saved wallets (2):

  - firstWallet: 0x443Cdb69aDA3B9Ca617cc14763FBA57bfB82fd00
  - imported: 0x4913AbCD40a9455a28134b4ccc37f4f95225e593

  🔑 Current wallet: imported
  ```

- Example output when switching between saved wallets:

  ```
  ? 🔁 Select the wallet you want to switch to: firstWallet
  ✅ Successfully switched to wallet: firstWallet
  📄 Address: 0x443Cdb69aDA3B9Ca617cc14763FBA57bfB82fd00
  💾 Wallet switch saved at /path/to/package/rootstock-wallet.json
  ```

- Example output when updating a wallet's name:

  ```
  📜 Available wallets:
  - firstWallet: 0x443Cdb69aDA3B9Ca617cc14763FBA57bfB82fd00 (Current)
  - imported: 0x4913AbCD40a9455a28134b4ccc37f4f95225e593
  ? 📝 Select the wallet you want to update the name for: imported
  ? 🖋️ Enter the new name for the wallet "imported": test
  ✅ Wallet name updated from "imported" to "test".
  💾 Changes saved at /path/to/package/rootstock-wallet.json
  ```

- Example output when backing up the wallet file:

  ```
  🔑 Current wallet: dev
  ? What would you like to do? 📂 Backup wallet data
  ? 💾 Enter the path where you want to save the backup: selected/backup/path
  💾 Changes saved at selected/backup/path
  ✅ Wallet backup created successfully!
  💾 Backup saved successfully at: selected/backup/path
  ```

- Example output when deleting a wallet:

  ```
  📜 Other available wallets:
  - test: 0x4913AbCD40a9455a28134b4ccc37f4f95225e593
  ? ❌ Select the wallet you want to delete: test
  ? ⚠️ Are you sure you want to delete the wallet "test"? This action cannot be undone. yes
  🗑️ Wallet "test" has been deleted.
  💾 Changes saved at /path/to/package/rootstock-wallet.json
  ```

### 2. Check Balance

The `balance` command allows you to check the balance of any token on the Rootstock blockchain for any of the saved wallets. You can check the balance on either the mainnet or testnet using the appropriate flags.

#### Mainnet

```bash
rsk-cli balance
```

Output example:

```
? Select token to check balance: RIF
✔ Balance retrieved successfully
📄 Token Information:
     Name: RIF Token
     Contract: 0x19f64674d8a5b4e652319f5e239efd3bc969a1fe
  👤 Holder Address: 0x28eb8d29e4713e211d1ddab19df3de16086bb8fa
  💰 Balance: 0.02 RIF
  🌐 Network: Rootstock Mainnet
🔗 Ensure that transactions are being conducted on the correct network.
```

#### Testnet

Use the `-t` or `--testnet` flag to check the balance on the Rootstock testnet.

```bash
rsk-cli balance -t
```

Output example:

```
? Select token to check balance: RIF
✔ Balance retrieved successfully
📄 Token Information:
     Name: tRIF Token
     Contract: 0x19f64674d8a5b4e652319f5e239efd3bc969a1fe
  👤 Holder Address: 0x28eb8d29e4713e211d1ddab19df3de16086bb8fa
  💰 Balance: 0.02 tRIF
  🌐 Network: Rootstock Testnet
🔗 Ensure that transactions are being conducted on the correct network.
```

#### Dynamic Wallet Selection

Use the `--wallet` flag to dynamically select the wallet.

```bash
rsk-cli balance --wallet <name>
```

### 3. Transfer (RBTC and ERC20)

The `transfer` command allows you to transfer both RBTC and ERC20 tokens from your saved wallet to a specified address on the Rootstock blockchain. You can execute transfers on either mainnet or testnet using the appropriate flags.

#### Interactive Mode

Use the `-i` or `--interactive` flag to enter transfer details interactively:

```bash
# Interactive mode on testnet
rsk-cli transfer --testnet -i

# Interactive mode on mainnet
rsk-cli transfer -i
```

#### For RBTC Transfer

```bash
# Basic transfer on mainnet
rsk-cli transfer --address 0xRecipientAddress --value 0.001

# Transfer on testnet
rsk-cli transfer --testnet --address 0x08C4E4BdAb2473E454B8B2a4400358792786d341 --value 0.001

# Using specific wallet
rsk-cli transfer --wallet <n> --address 0x08C4E4BdAb2473E454B8B2a4400358792786d341 --value 0.001

# Advanced transfer with custom gas parameters
rsk-cli transfer --address 0x08C4E4BdAb2473E454B8B2a4400358792786d341 --value 0.001 --gas-limit 21000 --priority-fee 1.5
```

Output example for RBTC transfer:
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

#### For ERC20 Token Transfer

Add the `--token` flag with the token contract address to transfer ERC20 tokens:

```bash
# Basic token transfer on mainnet
rsk-cli transfer --token 0xTokenAddress --address 0xRecipientAddress --value 0.1

# Token transfer on testnet
rsk-cli transfer --testnet --token 0x32Cd6c5831531F96f57d1faf4DDdf0222c4Af8AB --address 0x8A0d290b2EE35eFde47810CA8fF057e109e4190B --value 0.1

# Using specific wallet
rsk-cli transfer --wallet <n> --testnet --token 0x32Cd6c5831531F96f57d1faf4DDdf0222c4Af8AB --address 0x8A0d290b2EE35eFde47810CA8fF057e109e4190B --value 0.1

# Advanced token transfer with custom parameters
rsk-cli transfer --testnet --token 0x32Cd6c5831531F96f57d1faf4DDdf0222c4Af8AB --address 0x8A0d290b2EE35eFde47810CA8fF057e109e4190B --value 0.1 --gas-limit 65000 --data "0x1234abcd"
```

Output example for ERC20 transfer:
```
🔑 Wallet account: 0x6ad6b3926Fd18b0A8c9a20d659A25c9F6a69c8e0
📄 Token Information:
     Name: MyToken
     Symbol: MTK
     Contract: 0x32Cd6c5831531F96f57d1faf4DDdf0222c4Af8AB
🎯 To Address: 0x8A0d290b2EE35eFde47810CA8fF057e109e4190B
💵 Amount to Transfer: 0.1 MTK
✔ ✅ Simulation successful, proceeding with transfer...
🔄 Transaction initiated. TxHash: 0x680c4aa4f8b1ba0b7295a97d348a0ffa458a254d36af3cefc6048f8ae3f66b90
✅ Transfer completed successfully!
📦 Block Number: 6155122
⛽ Gas Used: 35460
🔗 View on Explorer: https://explorer.testnet.rootstock.io/tx/0x680c4aa4f8b1ba0b7295a97d348a0ffa458a254d36af3cefc6048f8ae3f66b90
```

#### Available Options

The transfer command supports the following options:

- `-i, --interactive`: Enter transfer details interactively
- `--testnet`: Use Rootstock testnet network
- `--address`: Recipient address
- `--value`: Amount to transfer
- `--token`: Token contract address (for ERC20 transfers)
- `--wallet`: Select a specific wallet to use
- `--gas-limit`: Custom gas limit for the transaction
- `--data`: Custom transaction data (hexadecimal format)

> **Note**: Before making any transfer, ensure you have:
> 1. A wallet configured with sufficient balance (RBTC or ERC20 tokens)
> 2. The correct ERC20 token contract address (when transferring tokens)
> 3. A valid recipient address
> 4. Enough RBTC to cover gas fees
> 5. Appropriate gas parameters for your transaction type

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

### 5. Deploy Smart Contract

The deploy command allows you to deploy a smart contract on the Rootstock blockchain. This command supports deployment on both the mainnet and testnet.

#### Mainnet

```bash
rsk-cli deploy --abi <path_to_abi> --bytecode <path_to_bytecode> --args <arg1> <arg2> ...
```

#### Testnet

```bash
rsk-cli deploy --testnet --abi <path_to_abi> --bytecode <path_to_bytecode> --args <arg1> <arg2> ...
```

#### Dynamic Wallet Selection

```bash
rsk-cli deploy --wallet <name> --abi <path_to_abi> --bytecode <path_to_bytecode> --args <arg1> <arg2> ...
```

Output example:

```
🔧 Initializing ViemProvider for testnet...
? Enter your password to decrypt the wallet: ****
🔑 Wallet account: 0xb4eb1352Ac339766727Df550A24D21f90935E78c
📄 Reading ABI from files/abi.json...
📄 Reading Bytecode from files/bytecode.bin...
✔ 🎉 Contract deployment transaction sent!
🔑 Transaction Hash: 0x4e4c6ed5998f3ea5391a66258c1dd0da1fa968d685b3d925d596ac16fdf81836
✔ 📜 Contract deployed successfully!
📍 Contract Address: 0xf922e98776686ae39119bc3ea224f54bd0500d3f
🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0xf922e98776686ae39119bc3ea224f54bd0500d3f
```

### 6. Verify Smart Contract

The verify command allows you to verify a smart contract on the Rootstock blockchain using JSON Standard Input via Rootstock Explorer API. This command supports contract verification on both the mainnet and testnet.

#### Mainnet

With arguments:

```bash
rsk-cli verify --json <path_to_json> --address <address> --name <contract_name> --decodedArgs <arg1> <arg2> ...
```

Without arguments:

```bash
rsk-cli verify --json <path_to_json> --address <address> --name <contract_name>
```

#### Testnet

With arguments:

```bash
rsk-cli verify --testnet --json <path_to_json> --address <address> --name <contract_name> --decodedArgs <arg1> <arg2> ...
```

Without arguments:

```bash
rsk-cli verify --testnet --json <path_to_json> --address <address> --name <contract_name>
```

Output example:

```
🔧 Initializing verification on testnet...
📄 Reading JSON Standard Input from files/30637d574184a42337b9861a661ee057.json...
🔎 Verifying contract ComplexStorage deployed at 0x5E6Fad85585E857A76368dD0962D3B0CCf48Eb21..
📄 Using constructor arguments: 0x28eb8d29e4713e211d1ddab19df3de16086bb8fa, 1
✔ 🎉 Contract verification request sent!
✔ 📜 Contract verified successfully!
🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0x5E6Fad85585E857A76368dD0962D3B0CCf48Eb21
```

### 7. Interact with verified smart contracts

The contract command allows you to interact with a smart contract on the Rootstock blockchain. This command lists all available read functions of a verified smart contract and allows you to call them. Write functions are excluded to ensure no state-changing operations are performed accidentally.

#### Mainnet

```bash
rsk-cli contract --address <address>
```

#### Testnet

```bash
rsk-cli contract --address <address> --testnet
```

Output example:

```
🔧 Initializing interaction on testnet...
🔎 Checking if contract 0x15c41c730b86d9a598bf00da2d27d963b6dd2318 is verified...
? Select a read function to call: symbol
📜 You selected: symbol

✅ Function symbol called successfully!
✔ 🔧 Result: ROOT
🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0x15c41c730b86d9a598bf00da2d27d963b6dd2318
```

### 8. Interact with RSK bridge contract

The bridge command allows you to interact with the RSK bridge contract on the Rootstock blockchain. This command lists all allowed read and write functions of the RSK bridge contract and allows you to call them.

#### Mainnet

```bash
rsk-cli bridge
```

#### Testnet

```bash
rsk-cli bridge --testnet
```

#### Dynamic Wallet Selection

```bash
rsk-cli bridge --wallet <name>
```

Output example:

```
🔧 Initializing bridge for testnet...
? Select the type of function you want to call: read
? Select a read function to call: getBtcBlockchainBestChainHeight
✅ Function getBtcBlockchainBestChainHeight called successfully!
✔ 🔧 Result: 3168757
🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0x0000000000000000000000000000000001000006
```

### 9. Fetch Wallet History

The history command allows you to fetch the transaction history for a wallet on the Rootstock blockchain. This includes transactions such as ERC20, ERC721, and external transfers. You can specify whether to fetch the history from the Mainnet or Testnet by providing the appropriate flag. For this command to work, make sure to have an Alchemy API key you can get from [Alchemy Dashboard](https://dashboard.alchemy.com/).

#### Mainnet

Without having the Alchemy API key previously set:

```bash
rsk-cli history --apiKey <apiKey> --number <number>
```

With Alchemy API key already set:

```bash
rsk-cli history --number <number>
```

#### Testnet

Without having the Alchemy API key previously set:

```bash
rsk-cli history --testnet --apiKey <apiKey> --number <number>
```

With Alchemy API key already set:

```bash
rsk-cli history --testnet --number <number>
```

Output example:

```
? 🔒 Enter Alchemy API key to fetch history: ********************************
🔍 Fetching transaction history on Rootstock Testnet for 0x19661D036D4e590948b9c00eef3807b88fBfA8e1 ...
✅ Transfer:
   From: 0x19661d036d4e590948b9c00eef3807b88fbfa8e1
   To: 0xb45805aead9407f5c7860ff8eccaedd4d0ab36a6
   Token: ETH
   Value: 0.000003
   Tx Hash: 0xde678614cd9e20fe5891c25069afef680174456b104f31c9078eb486abd95a64
   Time: Tue Nov 12 2024 11:46:32 GMT+0700 (Indochina Time)
```

### 9. Fetch Wallet History

The batch-transfer command allows you to send multiple transactions in one batch. This feature supports both interactive mode (manual input) and file-based batch processing, enabling you to transfer rBTC to multiple addresses in a single operation.

#### Interactive Mode

In this mode, the CLI will prompt you to enter the recipient addresses and amounts interactively.

#### Mainnet

```bash
rsk-cli batch-transfer --interactive
```

#### Testnet

```bash
rsk-cli batch-transfer --testnet --interactive
```

Output example:

```
Enter address: 0xDdC94BFde7C64117F35803AeA4FA4F98A7b4f57C
Enter amount: 0.0000001
Add another transaction? (y/n): y
Enter address: 0x28eb8D29e4713E211D1dDab19dF3de16086BB8fa
Enter amount: 0.0000001
Add another transaction? (y/n): n
✔ Enter your password to decrypt the wallet: ****
📄 Wallet Address: 0xb4eb1352Ac339766727Df550A24D21f90935E78c
💰 Current Balance: 0.036531414555536136 RBTC
🔄 Transaction initiated. TxHash: 0xd559fc4295c75957fec31c6a5f963ed6545589efa7c9050ea5bfae0739823314
✅ Transaction confirmed successfully!
📦 Block Number: 6021798
⛽ Gas Used: 21000
🔄 Transaction initiated. TxHash: 0xe7fc0c0bbbed6867cf24d69b70d2d16fd2a43ca4da66ee1f6ff0e3cdf0e9f97d
✅ Transaction confirmed successfully!
📦 Block Number: 6021800
⛽ Gas Used: 21000
```

#### File-based

In this mode, you provide a JSON file containing the batch transactions. The file must include a list of transactions, each specifying the recipient address (address) and the amount (amount). The file should look something like this:

```json
[
  { "to": "0x28eb8D29e4713E211D1dDab19dF3de16086BB8fa", "value": 0.000001 },
  { "to": "0xDdC94BFde7C64117F35803AeA4FA4F98A7b4f57C", "value": 0.000001 }
]
```

#### Mainnet

```bash
rsk-cli batch-transfer --file <path/to/file.json>
```

#### Testnet

```bash
rsk-cli batch-transfer --testnet --file <path/to/file.json>
```

Output example:

```
✔ Enter your password to decrypt the wallet: ****
📄 Wallet Address: 0xb4eb1352Ac339766727Df550A24D21f90935E78c
💰 Current Balance: 0.03653096205477013 RBTC
🔄 Transaction initiated. TxHash: 0xc985fc690117dbf9be1b25ffefa39e6c958c8b40c219b49870ef46c3b1865f47
✅ Transaction confirmed successfully!
📦 Block Number: 6021844
⛽ Gas Used: 21000
🔄 Transaction initiated. TxHash: 0xe5d39d8a8d7fb15f5c2d08c7e9b58b21cd68f2e8aef59eb7a24693ab0fe08c65
✅ Transaction confirmed successfully!
📦 Block Number: 6021846
⛽ Gas Used: 21000
```

## Contributing

We welcome contributions from the community. Please fork the repository and submit pull requests with your changes. Ensure your code adheres to the project's main objective.

## Support

For any questions or support, please open an issue on the repository or reach out to the maintainers.

# Disclaimer

The software provided in this GitHub repository is offered "as is," without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

- **Testing:** The software has not undergone testing of any kind, and its functionality, accuracy, reliability, and suitability for any purpose are not guaranteed.
- **Use at Your Own Risk:** The user assumes all risks associated with the use of this software. The author(s) of this software shall not be held liable for any damages, including but not limited to direct, indirect, incidental, special, consequential, or punitive damages arising out of the use of or inability to use this software, even if advised of the possibility of such damages.
- **No Liability:** The author(s) of this software are not liable for any loss or damage, including without limitation, any loss of profits, business interruption, loss of information or data, or other pecuniary loss arising out of the use of or inability to use this software.
- **Sole Responsibility:** The user acknowledges that they are solely responsible for the outcome of the use of this software, including any decisions made or actions taken based on the software's output or functionality.
- **No Endorsement:** Mention of any specific product, service, or organization does not constitute or imply endorsement by the author(s) of this software.
- **Modification and Distribution:** This software may be modified and distributed under the terms of the license provided with the software. By modifying or distributing this software, you agree to be bound by the terms of the license.
- **Assumption of Risk:** By using this software, the user acknowledges and agrees that they have read, understood, and accepted the terms of this disclaimer and assumes all risks associated with the use of this software.
