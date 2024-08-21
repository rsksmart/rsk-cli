# rsk-cli

## Description

`rsk-cli` is a command-line tool for interacting with Rootstock blockchain 


## Installation

To install the CLI tool globally, use the following command:

```bash
npm install -g rsk-cli
```

## Development

To install dependencies:

```bash
bun install
```
To run:

```bash
bun bin/index.ts
```
## Features

1. **Create Wallet**

    The command generates a new Ethereum-compatible wallet on the Rootstock blockchain using the viem library.

    ```bash
    rsk-cli createWallet
    ```
    Output example:
    ```
    Wallet created successfully on Rootstock!
    Address: 0x63281026e39bCa0F6B371a354ae3b0c79AC1e93B
    Private Key: 0xc5b8b8d70f5afb837f85698b5c8360b1af821f590dfe302af8cba465465fcbd6
    Please save the private key in a secure location.
    ```

2. **Check Balance**

    The `balance` command allows you to check the balance of your saved wallet on the Rootstock blockchain. You can check the balance on either the mainnet or testnet using the appropriate flags.

    - **Mainnet**:
      ```bash
      rsk-cli balance
      ```
      Output example:
      ```
      Balance on mainnet: 1.2345 RBTC
      ```

    - **Testnet**:
      Use the `-t` or `--testnet` flag to check the balance on the Rootstock testnet.
      ```bash
      rsk-cli balance -t
      ```
      Output example:
      ```
      Balance on testnet: 0.6789 RBTC
      ```
3. **Transfer rBTC**

    The `transfer` command allows you to transfer rBTC from your saved wallet to a specified address on the Rootstock blockchain. You can execute the transfer on either the mainnet or testnet using the appropriate flags.

    - **Mainnet**:
      ```bash
      rsk-cli transfer --address 0xRecipientAddress --value 0.001
      ```
      Output example:
      ```
      Transfer command arguments:
      Network: undefined
      Address: 0xRecipientAddress
      Value: 0.001 rBTC

      Transaction sent. TxHash: 0xabc123...
      Waiting for transaction receipt...
      Transaction successful!
      Block Number: 123456
      Gas Used: 21000
      ```

    - **Testnet**:
      Use the `-t` or `--testnet` flag to execute the transfer on the Rootstock testnet.
      ```bash
      rsk-cli transfer --testnet --address 0xa5f45f5bddefC810C48aCC1D5CdA5e5a4c6BC59E --value 0.001
      ```
      Output example:
      ```
      Transfer command arguments:
      Network: true
      Address: 0xa5f45f5bddefC810C48aCC1D5CdA5e5a4c6BC59E
      Value: 0.001 rBTC

      Transaction sent. TxHash: 0xabc123...
      Waiting for transaction receipt...
      Transaction successful!
      Block Number: 654321
      Gas Used: 21000
      ```