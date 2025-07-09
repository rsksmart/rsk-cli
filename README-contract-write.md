## ✨ New **write** feature in the `contract` Command

- You can now select and call both read and **write functions** from the contract menu.
- Prompts support booleans (`true`, `false`, `1`, `0`, `yes`, `no`), non-empty strings, comma-separated arrays, and payable RBTC values (auto-converted to wei).
- Invalid input (e.g., empty string) triggers a clear, user-friendly error message and prevents the contract call.
- Enhanced UX: intuitive function selectors, clear prompts, and automatic explorer links to check your transactions and contract addresses.


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
- **Payable function:**
  ```sh
  rsk-cli contract -a 0xeAe6CF2f7Ed752e7765856272Ad521410db34210 -t
  ```
- **Array parameters:**
  ```sh
  rsk-cli contract -a 0x6156Cd50B74da35dA1857860EEa88591Cb584be9 -t
  ```

---

## 🛡️ Error Handling Example

- If you enter an empty string for a required argument:
  ```
  ❌ String argument cannot be empty.
  ```

---

## 🔗 Explorer Links

- After a write transaction, you’ll see:
  - A link to the transaction details
  - A link to the contract address

---


