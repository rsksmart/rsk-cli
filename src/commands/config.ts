import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { logError, logSuccess, logInfo, logWarning } from "../utils/logger.js";

interface ConfigData {
  defaultNetwork: "mainnet" | "testnet";
  defaultGasLimit: number;
  defaultGasPrice: number;
  alchemyApiKey?: string;
  displayPreferences: {
    showExplorerLinks: boolean;
    showGasDetails: boolean;
    showBlockDetails: boolean;
    compactMode: boolean;
  };
  walletPreferences: {
    autoConfirmTransactions: boolean;
    defaultWallet?: string;
  };
}

const configFilePath = path.join(process.cwd(), "rsk-cli-config.json");

const defaultConfig: ConfigData = {
  defaultNetwork: "mainnet",
  defaultGasLimit: 21000,
  defaultGasPrice: 0,
  displayPreferences: {
    showExplorerLinks: true,
    showGasDetails: true,
    showBlockDetails: true,
    compactMode: false,
  },
  walletPreferences: {
    autoConfirmTransactions: false,
  },
};

function loadConfig(): ConfigData {
  try {
    if (fs.existsSync(configFilePath)) {
      const configData = fs.readFileSync(configFilePath, "utf8");
      const config = JSON.parse(configData);
      return { ...defaultConfig, ...config };
    }
  } catch (error) {
    logWarning(false, "⚠️ Error loading config, using defaults");
  }
  return defaultConfig;
}

function saveConfig(config: ConfigData): void {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    logSuccess(false, "✅ Configuration saved successfully!");
  } catch (error) {
    logError(false, `❌ Error saving configuration: ${error}`);
  }
}

function displayCurrentConfig(config: ConfigData): void {
  logInfo(false, "📋 Current Configuration:");
  logInfo(false, "");

  logInfo(false, `🌐 Default Network: ${chalk.green(config.defaultNetwork)}`);
  logInfo(false, `⛽ Default Gas Limit: ${chalk.green(config.defaultGasLimit.toLocaleString())}`);
  logInfo(false, `💰 Default Gas Price: ${chalk.green(config.defaultGasPrice === 0 ? "Auto" : `${config.defaultGasPrice} Gwei`)}`);

  if (!config.alchemyApiKey) {
    logInfo(false, `🔑 Alchemy API Key: ${chalk.red("Not set")}`);
  }

  logInfo(false, "");
  logInfo(false, "🎨 Display Preferences:");
  logInfo(false, `  🔗 Show Explorer Links: ${config.displayPreferences.showExplorerLinks ? chalk.green("Yes") : chalk.red("No")}`);
  logInfo(false, `  ⛽ Show Gas Details: ${config.displayPreferences.showGasDetails ? chalk.green("Yes") : chalk.red("No")}`);
  logInfo(false, `  📦 Show Block Details: ${config.displayPreferences.showBlockDetails ? chalk.green("Yes") : chalk.red("No")}`);
  logInfo(false, `  📱 Compact Mode: ${config.displayPreferences.compactMode ? chalk.green("Yes") : chalk.red("No")}`);

  logInfo(false, "");
  logInfo(false, "👛 Wallet Preferences:");
  logInfo(false, `  ✅ Auto Confirm Transactions: ${config.walletPreferences.autoConfirmTransactions ? chalk.green("Yes") : chalk.red("No")}`);
  if (config.walletPreferences.defaultWallet) {
    logInfo(false, `  🏦 Default Wallet: ${chalk.green(config.walletPreferences.defaultWallet)}`);
  } else {
    logInfo(false, `  🏦 Default Wallet: ${chalk.red("Not set")}`);
  }

  logInfo(false, "");
}

async function configureNetwork(config: ConfigData): Promise<ConfigData> {
  const { defaultNetwork } = await inquirer.prompt([
    {
      type: "list",
      name: "defaultNetwork",
      message: "Select default network:",
      choices: [
        { name: "Mainnet", value: "mainnet" },
        { name: "Testnet", value: "testnet" },
      ],
      default: config.defaultNetwork,
    },
  ]);
  
  config.defaultNetwork = defaultNetwork;
  return config;
}

async function configureGasSettings(config: ConfigData): Promise<ConfigData> {
  const { defaultGasLimit, defaultGasPrice } = await inquirer.prompt([
    {
      type: "number",
      name: "defaultGasLimit",
      message: "Enter default gas limit:",
      default: config.defaultGasLimit,
      validate: (value) => {
        if (value === undefined || value === null) return "Gas limit is required";
        if (value <= 0) return "Gas limit must be greater than 0";
        if (value > 30000000) return "Gas limit too high (max 30M)";
        return true;
      },
    },
    {
      type: "number",
      name: "defaultGasPrice",
      message: "Enter default gas price in Gwei (0 for auto):",
      default: config.defaultGasPrice,
      validate: (value) => {
        if (value === undefined || value === null) return "Gas price is required";
        if (value < 0) return "Gas price cannot be negative";
        return true;
      },
    },
  ]);
  
  config.defaultGasLimit = defaultGasLimit;
  config.defaultGasPrice = defaultGasPrice;
  return config;
}

async function configureApiKey(config: ConfigData): Promise<ConfigData> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do with the Alchemy API key?",
      choices: [
        { name: "Set/Update API Key", value: "set" },
        { name: "Remove API Key", value: "remove" },
        { name: "Skip", value: "skip" },
      ],
    },
  ]);
  
  if (action === "set") {
    const { alchemyApiKey } = await inquirer.prompt([
      {
        type: "password",
        name: "alchemyApiKey",
        message: "Enter your Alchemy API key:",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "API key cannot be empty";
          }
          return true;
        },
      },
    ]);
    config.alchemyApiKey = alchemyApiKey;
  } else if (action === "remove") {
    delete config.alchemyApiKey;
  }
  
  return config;
}

async function configureDisplayPreferences(config: ConfigData): Promise<ConfigData> {
  const { showExplorerLinks, showGasDetails, showBlockDetails, compactMode } = await inquirer.prompt([
    {
      type: "confirm",
      name: "showExplorerLinks",
      message: "Show explorer links in transaction output?",
      default: config.displayPreferences.showExplorerLinks,
    },
    {
      type: "confirm",
      name: "showGasDetails",
      message: "Show gas details in transaction output?",
      default: config.displayPreferences.showGasDetails,
    },
    {
      type: "confirm",
      name: "showBlockDetails",
      message: "Show block details in transaction output?",
      default: config.displayPreferences.showBlockDetails,
    },
    {
      type: "confirm",
      name: "compactMode",
      message: "Enable compact mode for output?",
      default: config.displayPreferences.compactMode,
    },
  ]);
  
  config.displayPreferences = {
    showExplorerLinks,
    showGasDetails,
    showBlockDetails,
    compactMode,
  };
  
  return config;
}

async function configureWalletPreferences(config: ConfigData): Promise<ConfigData> {
  const { autoConfirmTransactions, defaultWallet } = await inquirer.prompt([
    {
      type: "confirm",
      name: "autoConfirmTransactions",
      message: "Auto-confirm transactions (skip password prompt)?",
      default: config.walletPreferences.autoConfirmTransactions,
    },
    {
      type: "input",
      name: "defaultWallet",
      message: "Enter default wallet name (optional, press Enter to skip):",
      default: config.walletPreferences.defaultWallet || "",
    },
  ]);
  
  config.walletPreferences.autoConfirmTransactions = autoConfirmTransactions;
  if (defaultWallet && defaultWallet.trim()) {
    config.walletPreferences.defaultWallet = defaultWallet.trim();
  } else {
    delete config.walletPreferences.defaultWallet;
  }
  
  return config;
}

async function resetToDefaults(): Promise<ConfigData> {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Are you sure you want to reset all settings to defaults?",
      default: false,
    },
  ]);
  
  if (confirm) {
    logWarning(false, "🔄 Resetting configuration to defaults...");
    return defaultConfig;
  }
  
  return loadConfig();
}

export async function configCommand(): Promise<void> {
  try {
    logInfo(false, "⚙️ RSK CLI Configuration Manager");
    logInfo(false, "");
    
    let config = loadConfig();
    
    const actions = [
      "📋 View Current Configuration",
      "🌐 Configure Network Settings",
      "⛽ Configure Gas Settings",
      "🔑 Configure API Keys",
      "🎨 Configure Display Preferences",
      "👛 Configure Wallet Preferences",
      "🔄 Reset to Defaults",
      "💾 Save and Exit",
    ];
    
    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: actions,
        },
      ]);
      
      switch (action) {
        case "📋 View Current Configuration":
          displayCurrentConfig(config);
          break;
          
        case "🌐 Configure Network Settings":
          config = await configureNetwork(config);
          logSuccess(false, "✅ Network settings updated!");
          break;
          
        case "⛽ Configure Gas Settings":
          config = await configureGasSettings(config);
          logSuccess(false, "✅ Gas settings updated!");
          break;
          
        case "🔑 Configure API Keys":
          config = await configureApiKey(config);
          logSuccess(false, "✅ API key settings updated!");
          break;
          
        case "🎨 Configure Display Preferences":
          config = await configureDisplayPreferences(config);
          logSuccess(false, "✅ Display preferences updated!");
          break;
          
        case "👛 Configure Wallet Preferences":
          config = await configureWalletPreferences(config);
          logSuccess(false, "✅ Wallet preferences updated!");
          break;
          
        case "🔄 Reset to Defaults":
          config = await resetToDefaults();
          break;
          
        case "💾 Save and Exit":
          saveConfig(config);
          logInfo(false, "👋 Configuration saved. Goodbye!");
          return;
      }
      
      logInfo(false, "");
    }
  } catch (error: any) {
    logError(false, `❌ Error in configuration manager: ${error.message}`);
  }
}


export function getConfig(): ConfigData {
  return loadConfig();
}


export function getConfigValue<T extends keyof ConfigData>(key: T): ConfigData[T] {
  const config = loadConfig();
  return config[key];
} 
