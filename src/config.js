import fs from "fs"
import path from "path"
import os from "os"
import inquirer from "inquirer"
import chalk from "chalk"

const CONFIG_FILE = path.join(os.homedir(), ".retrohash-config.json")

/**
 * Load configuration from the config file
 * @returns {Object|null} Config object or null if not found
 */
export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8")
      return JSON.parse(data)
    }
  } catch (error) {
    console.error(chalk.yellow("Warning: Could not read config file"))
  }
  return null
}

/**
 * Save configuration to the config file
 * @param {Object} config - Configuration object with username and apiKey
 */
export function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
    console.log(chalk.green(`✓ Configuration saved to ${CONFIG_FILE}`))
  } catch (error) {
    console.error(chalk.red("Error: Could not save config file"))
    throw error
  }
}

/**
 * Check if we have a valid config
 * @returns {boolean}
 */
export function hasValidConfig() {
  const config = loadConfig()
  return config && config.username && config.apiKey
}

/**
 * Prompt user for credentials and save them
 * @returns {Promise<Object>} Config object with username and apiKey
 */
export async function promptForCredentials() {
  console.log(chalk.cyan("\n🎮 RetroAchievements API Setup\n"))
  console.log(
    chalk.dim(
      "You can find your API key at: https://retroachievements.org/settings\n"
    )
  )

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "username",
      message: "Enter your RetroAchievements username:",
      validate: (input) => input.trim().length > 0 || "Username is required",
    },
    {
      type: "password",
      name: "apiKey",
      message: "Enter your RetroAchievements API key:",
      mask: "*",
      validate: (input) => input.trim().length > 0 || "API key is required",
    },
    {
      type: "confirm",
      name: "save",
      message: "Save credentials for future use?",
      default: true,
    },
  ])

  const config = {
    username: answers.username.trim(),
    apiKey: answers.apiKey.trim(),
  }

  if (answers.save) {
    saveConfig(config)
  }

  return config
}

/**
 * Get credentials - load from file or prompt user
 * @returns {Promise<Object>} Config object with username and apiKey
 */
export async function getCredentials() {
  const config = loadConfig()

  if (config && config.username && config.apiKey) {
    console.log(chalk.dim(`Using saved credentials for ${config.username}`))
    return config
  }

  return promptForCredentials()
}
