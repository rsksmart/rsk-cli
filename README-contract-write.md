## ✨ New **write** Feature in the `contract` Command

- **Call both read and write functions** directly from the contract menu, with intuitive function selection.
- **User-friendly prompts** for all argument types:
  - Booleans (`true`, `false`, `1`, `0`, `yes`, `no`)
  - Non-empty strings (empty input is rejected with a clear error)
  - Comma-separated arrays (empty values are ignored)
  - Payable RBTC values (auto-converted to wei)
- **Clear, actionable error messages** for invalid input—prevents contract calls until all arguments are valid.
- **Automatic explorer links** after each transaction, so you can easily check your transaction and contract address.


## 📝 Example Usage

```sh
rsk-cli contract -a <contract-address> -t
```
- Select a function (read or write) from the menu
- Enter arguments as prompted
- For payable functions, enter the amount in RBTC (e.g., `0.01`)

## 📚 Example Contracts

- **Various parameter types:**
  ```sh
  rsk-cli contract -a 0x429907ECe0c4E51417DAFA5EBcb2A2c1c2fbFF37 -t
  ```
  Output example:

  ```
    ✔ Select a contract function to call or modify: setStoredData
   ✍️ Write Functions
    setAllData
    setStoredAddress
    setStoredBool
    setStoredData
    setStoredString
    🔎 Read Functions

  📜 You selected: setStoredData

    ✔ Enter the value for argument _value (uint256): 7
    ✔ Enter your password to decrypt the wallet: ********
    ✔ ✅ Transaction sent! Hash: 0x1e90e7f238cf3d096e7a20a333c74f8495a563359385015d8ea79de7bca16464      
    🔗 View transaction on Explorer: https://explorer.testnet.rootstock.io/tx/0x1e90e7f238cf3d096e7a20a333c74f8495a563359385015d8ea79de7bca16464
    🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0x429907ece0c4e51417dafa5ebcb2a2c1c2fbff37
  ```


- **Payable function:**
  ```sh
  rsk-cli contract -a 0xeAe6CF2f7Ed752e7765856272Ad521410db34210 -t
  ```
  Output example:

    ```
    ? Select a contract function to call or modify:
  🔎 Read Functions
    getBalance
  ✍️ Write Functions
  ❯ deposit

    📜 You selected: deposit

  ✔ Enter the value to send (in RBTC, e.g. 0.01): 0.0000823
  ✔ Enter your password to decrypt the wallet: ********
  ✔ ✅ Transaction sent! Hash: 0xdc1741250cb3e50527593846dd9d40e0c24db2b274853708563041ea2b04b97d
  🔗 View transaction on Explorer: https://explorer.testnet.rootstock.io/tx/0xdc1741250cb3e50527593846dd9d40e0c24db2b274853708563041ea2b04b97d
  🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0xeae6cf2f7ed752e7765856272ad521410db34210
  ```

- **Array parameters:**
  ```sh
  rsk-cli contract -a 0x6156Cd50B74da35dA1857860EEa88591Cb584be9 -t
  ```

  Output example:

    ```
    ? Select a contract function to call or modify:
    🔎 Read Functions
    ❯ authorized
    getAuthorized
    ✍️ Write Functions
    addAuthorized

    📜 You selected: addAuthorized
    ✔ Enter the value for argument users (address[]): 0xF889Ad94a99fE80f1EEF42689ad7f274368B24DD
    ✔ Enter your password to decrypt the wallet: ********
    ✔ ✅ Transaction sent! Hash: 0xe2fde34624e2143ef72fd3a95aefcdcff2df7ce426aca7cd4825b233d9a06e3f
    🔗 View transaction on Explorer: https://explorer.testnet.rootstock.io/tx/0xe2fde34624e2143ef72fd3a95aefcdcff2df7ce426aca7cd4825b233d9a06e3f
    🔗 View on Explorer: https://explorer.testnet.rootstock.io/address/0x6156cd50b74da35da1857860eea88591cb584be9

  ```

---

## 🛡️ Error Handling Example

- This update provides more user-friendly input validation and clearer error messages than ethers.js typically offers. For example, it validates booleans, ensures required strings are not empty, and parses arrays from comma-separated input. Instead of generic or technical errors, users receive actionable feedback at the prompt, making the experience smoother and less error-prone.

**Examples:**

- If you enter an empty string for a required argument:
  ```
  ❌ String argument cannot be empty.
  ```
- If you enter an invalid boolean value:
  ```
  ❌ Invalid boolean value. Please enter true or false.
  ```
- If you enter a comma-separated list for an array argument, empty values are ignored:
  ```
  (input: "a, ,b,,c") → ["a", "b", "c"]
  ```

> **Note:**
> Unlike ethers.js, which often throws generic or technical errors, this update provides clear, context-aware messages for supported types and prevents contract calls until all required inputs are valid. This results in a much smoother and safer user experience for the supported argument types.

---



