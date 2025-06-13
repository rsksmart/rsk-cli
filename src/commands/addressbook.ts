import fs from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import crypto from "crypto";
import { Address } from "viem";
import { walletFilePath } from "../utils/constants.js";

interface AddressEntry {
  address?: Address;
  label?: string;
  notes?: string;
  encrypted?: boolean;
  encryptedData?: string;
  iv?: string;
}

interface AddressBookData {
  addresses: Record<string, AddressEntry>;
}

export async function addressBookCommand() {
  try {
    const actions = [
      "👀 View address book",
      "➕ Add new address",
      "✏️ Edit address entry",
      "❌ Delete address entry",
      "🔒 Encrypt/Decrypt entry",
      "🔍 Search addresses",
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do with the address book?",
        choices: actions,
      },
    ]);

    switch (action) {
      case "👀 View address book":
        await viewAddressBook();
        break;
      case "➕ Add new address":
        await addNewAddress();
        break;
      case "✏️ Edit address entry":
        await editAddress();
        break;
      case "❌ Delete address entry":
        await deleteAddress();
        break;
      case "🔒 Encrypt/Decrypt entry":
        await toggleEncryption();
        break;
      case "🔍 Search addresses":
        await searchAddresses();
        break;
    }
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error managing address book:"),
      chalk.yellow(error.message || error)
    );
  }
}

async function loadAddressBook(): Promise<AddressBookData> {
  try {
    if (fs.existsSync(walletFilePath)) {
      const data = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
      return data.addressBook || { addresses: {} };
    }
    return { addresses: {} };
  } catch (error) {
    return { addresses: {} };
  }
}

async function saveAddressBook(addressBook: AddressBookData) {
  try {
    const data = JSON.parse(fs.readFileSync(walletFilePath, "utf8"));
    data.addressBook = addressBook;
    fs.writeFileSync(walletFilePath, JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error(
      chalk.red("❌ Error saving address book:"),
      chalk.yellow(error.message || error)
    );
  }
}

async function viewAddressBook() {
  const addressBook = await loadAddressBook();
  if (Object.keys(addressBook.addresses).length === 0) {
    console.log(chalk.yellow("📝 Address book is empty"));
    return;
  }

  console.log(chalk.green("\n📖 Address Book Entries:"));
  for (const [label, entry] of Object.entries(addressBook.addresses)) {
    if (entry.encrypted) {
      console.log(chalk.blue(`\n📌 Encrypted Entry`));
      console.log(chalk.yellow(`   🔒 This entry is encrypted. Use the decrypt option to view its contents.`));
      continue;
    }

    console.log(chalk.blue(`\n📌 ${label}:`));
    console.log(chalk.white(`   Address: ${entry.address}`));
    if (entry.notes) {
      console.log(chalk.white(`   Notes: ${entry.notes}`));
    }
  }
}

async function addNewAddress() {
  const addressBook = await loadAddressBook();
  
  const { label, address, notes, encrypt } = await inquirer.prompt([
    {
      type: "input",
      name: "label",
      message: "Enter a label for this address:",
      validate: (input) => {
        if (!input) return "Label is required";
        if (addressBook.addresses[input]) return "Label already exists";
        return true;
      },
    },
    {
      type: "input",
      name: "address",
      message: "Enter the address:",
      validate: (input) => {
        if (!input) return "Address is required";
        if (!input.match(/^0x[a-fA-F0-9]{40}$/)) {
          return "Invalid address format";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "notes",
      message: "Enter notes (optional):",
    },
    {
      type: "confirm",
      name: "encrypt",
      message: "Would you like to encrypt this entry? This will protect sensitive information including the address, label, and notes.",
      default: false,
    },
  ]);

  if (encrypt) {
    const { password } = await inquirer.prompt([
      {
        type: "password",
        name: "password",
        message: "Enter encryption password (you'll need this to view the entry later):",
        mask: "*",
        validate: (input) => {
          if (!input || input.length < 8) return "Password must be at least 8 characters long";
          return true;
        }
      },
    ]);

    const iv = Uint8Array.from(crypto.randomBytes(16));
    const key = Uint8Array.from(crypto.scryptSync(password, 'salt', 32));
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    const dataToEncrypt = {
      address: address as Address,
      label,
      notes: notes || undefined
    };

    let encryptedData = cipher.update(JSON.stringify(dataToEncrypt), "utf8", "hex");
    encryptedData += cipher.final("hex");

    addressBook.addresses[label] = {
      encrypted: true,
      encryptedData,
      iv: Buffer.from(iv).toString("hex")
    };
  } else {
    addressBook.addresses[label] = {
      address: address as Address,
      label,
      notes: notes || undefined,
    };
  }

  await saveAddressBook(addressBook);
  console.log(chalk.green("✅ Address added successfully!"));
}

async function editAddress() {
  const addressBook = await loadAddressBook();
  if (Object.keys(addressBook.addresses).length === 0) {
    console.log(chalk.yellow("📝 Address book is empty"));
    return;
  }

  const { label } = await inquirer.prompt([
    {
      type: "list",
      name: "label",
      message: "Select address to edit:",
      choices: Object.keys(addressBook.addresses),
    },
  ]);

  const entry = addressBook.addresses[label];
  const { newLabel, newAddress, newNotes } = await inquirer.prompt([
    {
      type: "input",
      name: "newLabel",
      message: "Enter new label (leave empty to keep current):",
      default: label,
    },
    {
      type: "input",
      name: "newAddress",
      message: "Enter new address (leave empty to keep current):",
      default: entry.address,
      validate: (input) => {
        if (!input) return true;
        if (!input.match(/^0x[a-fA-F0-9]{40}$/)) {
          return "Invalid address format";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "newNotes",
      message: "Enter new notes (leave empty to keep current):",
      default: entry.notes,
    },
  ]);

  if (newLabel !== label) {
    delete addressBook.addresses[label];
    addressBook.addresses[newLabel] = {
      ...entry,
      label: newLabel,
      address: (newAddress || entry.address) as Address,
      notes: newNotes || entry.notes,
    };
  } else {
    addressBook.addresses[label] = {
      ...entry,
      address: (newAddress || entry.address) as Address,
      notes: newNotes || entry.notes,
    };
  }

  await saveAddressBook(addressBook);
  console.log(chalk.green("✅ Address updated successfully!"));
}

async function deleteAddress() {
  const addressBook = await loadAddressBook();
  if (Object.keys(addressBook.addresses).length === 0) {
    console.log(chalk.yellow("📝 Address book is empty"));
    return;
  }

  const { label, confirm } = await inquirer.prompt([
    {
      type: "list",
      name: "label",
      message: "Select address to delete:",
      choices: Object.keys(addressBook.addresses),
    },
    {
      type: "confirm",
      name: "confirm",
      message: "Are you sure you want to delete this address?",
      default: false,
    },
  ]);

  if (confirm) {
    delete addressBook.addresses[label];
    await saveAddressBook(addressBook);
    console.log(chalk.green("✅ Address deleted successfully!"));
  }
}

async function toggleEncryption() {
  const addressBook = await loadAddressBook();
  if (Object.keys(addressBook.addresses).length === 0) {
    console.log(chalk.yellow("📝 Address book is empty"));
    return;
  }

  const { label } = await inquirer.prompt([
    {
      type: "list",
      name: "label",
      message: "Select address entry:",
      choices: Object.keys(addressBook.addresses),
    },
  ]);

  const entry = addressBook.addresses[label];

  if (entry.encrypted) {
    const { password } = await inquirer.prompt([
      {
        type: "password",
        name: "password",
        message: "Enter decryption password:",
        mask: "*",
      },
    ]);

    try {
      const iv = Uint8Array.from(Buffer.from(entry.iv!, "hex"));
      const key = Uint8Array.from(crypto.scryptSync(password, 'salt', 32));
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

      let decrypted = decipher.update(entry.encryptedData!, "hex", "utf8");
      decrypted += decipher.final("utf8");

      const decryptedData = JSON.parse(decrypted);
      

      console.log(chalk.green("\n🔓 Decrypted Entry:"));
      console.log(chalk.blue(`   Label: ${decryptedData.label}`));
      console.log(chalk.white(`   Address: ${decryptedData.address}`));
      if (decryptedData.notes) {
        console.log(chalk.white(`   Notes: ${decryptedData.notes}`));
      }

      const { keepDecrypted } = await inquirer.prompt([
        {
          type: "confirm",
          name: "keepDecrypted",
          message: "Would you like to keep this entry decrypted?",
          default: false,
        },
      ]);

      if (keepDecrypted) {
        addressBook.addresses[label] = {
          address: decryptedData.address,
          label: decryptedData.label,
          notes: decryptedData.notes,
          encrypted: false,
        };

        await saveAddressBook(addressBook);
        console.log(chalk.green("✅ Entry permanently decrypted!"));
      }
    } catch (error) {
      console.error(chalk.red("❌ Incorrect password or corrupted data"));
    }
    return;
  }


  const { password } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: "Enter encryption password (you'll need this to view the entry later):",
      mask: "*",
      validate: (input) => {
        if (!input || input.length < 8) return "Password must be at least 8 characters long";
        return true;
      }
    },
  ]);

  const iv = Uint8Array.from(crypto.randomBytes(16));
  const key = Uint8Array.from(crypto.scryptSync(password, 'salt', 32));
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  const dataToEncrypt = {
    address: entry.address,
    label: entry.label,
    notes: entry.notes
  };

  let encryptedData = cipher.update(JSON.stringify(dataToEncrypt), "utf8", "hex");
  encryptedData += cipher.final("hex");

  addressBook.addresses[label] = {
    encrypted: true,
    encryptedData,
    iv: Buffer.from(iv).toString("hex"),
  };

  await saveAddressBook(addressBook);
  console.log(chalk.green("✅ Entry encrypted successfully!"));
}

async function searchAddresses() {
  const addressBook = await loadAddressBook();
  if (Object.keys(addressBook.addresses).length === 0) {
    console.log(chalk.yellow("📝 Address book is empty"));
    return;
  }

  const { searchTerm } = await inquirer.prompt([
    {
      type: "input",
      name: "searchTerm",
      message: "Enter search term (label or address):",
    },
  ]);

  const results = Object.entries(addressBook.addresses).filter(
    ([label, entry]) =>
      label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (results.length === 0) {
    console.log(chalk.yellow("🔍 No matches found"));
    return;
  }

  console.log(chalk.green("\n🔍 Search Results:"));
  results.forEach(([label, entry]) => {
    console.log(chalk.blue(`\n📌 ${label}:`));
    console.log(chalk.white(`   Address: ${entry.address}`));
    if (entry.notes && !entry.encrypted) {
      console.log(chalk.white(`   Notes: ${entry.notes}`));
    }
    if (entry.encrypted) {
      console.log(chalk.yellow(`   🔒 This entry is encrypted`));
    }
  });
}
