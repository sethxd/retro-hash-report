#!/usr/bin/env node

import { program } from "commander"
import inquirer from "inquirer"
import ora from "ora"
import chalk from "chalk"

import { getCredentials } from "./config.js"
import { createAuthorization, getConsoles, getGameHashes } from "./api.js"
import { scanDirectory, listRomFiles, suggestConsole } from "./scanner.js"
import {
  displayResults,
  displayHeader,
  displayScanInfo,
  displayError,
  displayApiStats,
} from "./display.js"

// CLI configuration
program
  .name("ra-hash")
  .description("Check ROM hashes against RetroAchievements database")
  .version("1.0.0")
  .option("-p, --path <directory>", "Path to ROM directory", process.cwd())
  .option("-s, --system <id>", "System/console ID (skip selection prompt)")
  .parse(process.argv)

const options = program.opts()

/**
 * Main application entry point
 */
async function main() {
  try {
    displayHeader("RetroAchievements ROM Hash Checker")

    // Step 1: Get credentials
    const credentials = await getCredentials()
    const authorization = createAuthorization(credentials)

    // Step 2: Check ROM directory
    const romDirectory = options.path
    const romFiles = await listRomFiles(romDirectory)

    if (romFiles.length === 0) {
      displayError(`No ROM files found in: ${romDirectory}`)
      console.log(
        chalk.dim(
          "Supported extensions: .nes, .sfc, .smc, .gb, .gbc, .gba, .md, .bin, .n64, .iso, and more"
        )
      )
      process.exit(1)
    }

    console.log(
      chalk.dim(`Found ${romFiles.length} ROM file(s) in ${romDirectory}\n`)
    )

    // Step 3: Fetch consoles
    let spinner = ora("Fetching console list from RetroAchievements...").start()
    let consoles

    try {
      consoles = await getConsoles(authorization)
      spinner.succeed(
        `Loaded ${consoles.length} systems from RetroAchievements`
      )
    } catch (error) {
      spinner.fail("Failed to fetch console list")
      displayError(error.message)
      process.exit(1)
    }

    // Step 4: Suggest console based on folder name and ROM extensions
    const suggestedConsole = suggestConsole(romDirectory, romFiles, consoles)

    // Step 5: Select console
    let selectedConsole

    if (options.system) {
      // Use provided system ID
      const systemId = parseInt(options.system, 10)
      selectedConsole = consoles.find((c) => c.id === systemId)

      if (!selectedConsole) {
        displayError(`System ID ${systemId} not found`)
        process.exit(1)
      }
    } else if (suggestedConsole) {
      // Show suggestion with y/n confirmation
      console.log(
        chalk.yellow(
          `💡 Suggested console based on folder name and ROM extensions: ${suggestedConsole.name} (ID: ${suggestedConsole.id})\n`
        )
      )

      const confirmAnswer = await inquirer.prompt([
        {
          type: "confirm",
          name: "useSuggested",
          message: `Use ${suggestedConsole.name}?`,
          default: true,
        },
      ])

      if (confirmAnswer.useSuggested) {
        selectedConsole = suggestedConsole
      } else {
        // Show full selection list
        const choices = consoles.map((c) => ({
          name: `${c.name} (ID: ${c.id})`,
          value: c,
        }))

        const answer = await inquirer.prompt([
          {
            type: "list",
            name: "console",
            message: "Select the system for your ROMs:",
            choices,
            pageSize: 15,
            loop: false,
          },
        ])

        selectedConsole = answer.console
      }
    } else {
      // No suggestion available, show full selection list
      const choices = consoles.map((c) => ({
        name: `${c.name} (ID: ${c.id})`,
        value: c,
      }))

      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "console",
          message: "Select the system for your ROMs:",
          choices,
          pageSize: 15,
          loop: false,
        },
      ])

      selectedConsole = answer.console
    }

    console.log(chalk.cyan(`\nSelected: ${selectedConsole.name}\n`))

    // Step 6: Fetch game hashes for selected console
    spinner = ora(`Fetching game data for ${selectedConsole.name}...`).start()
    let hashMap

    try {
      hashMap = await getGameHashes(authorization, selectedConsole.id)
      spinner.succeed(
        `Loaded ${hashMap.size} known hashes for ${selectedConsole.name}`
      )
    } catch (error) {
      spinner.fail("Failed to fetch game data")
      displayError(error.message)
      process.exit(1)
    }

    // Step 7: Scan ROMs and calculate hashes
    displayScanInfo(romDirectory, romFiles.length, selectedConsole.name)

    spinner = ora("Calculating ROM hashes...").start()
    let scannedRoms

    try {
      // Enable debug logging if DEBUG env var is set
      if (process.env.DEBUG) {
        console.error(chalk.dim("\n[DEBUG MODE] Detailed logging enabled\n"))
      }

      scannedRoms = await scanDirectory(romDirectory, {
        onFileStart: (filename, size) => {
          if (!process.env.DEBUG) {
            // Update spinner text with current file being processed
            spinner.text = `Calculating ROM hashes... (${filename})`
          }
        },
        onFileComplete: (filename, hash) => {
          // Progress updates are handled by scanDirectory logging
        },
      })
      spinner.succeed(`Hashed ${scannedRoms.length} ROM files`)
    } catch (error) {
      spinner.fail("Failed to scan ROMs")
      console.error(chalk.red(`\n[ERROR] Scan failed: ${error.message}`))
      if (error.stack && process.env.DEBUG) {
        console.error(chalk.red(`[ERROR] Stack trace:\n${error.stack}`))
      }
      displayError(error.message)
      process.exit(1)
    }

    // Step 8: Compare hashes
    spinner = ora("Comparing against RetroAchievements database...").start()

    const results = scannedRoms.map((rom) => {
      if (rom.error) {
        return {
          filename: rom.filename,
          hash: null,
          match: null,
          error: rom.error,
        }
      }

      const match = hashMap.get(rom.hash)
      return {
        filename: rom.filename,
        hash: rom.hash,
        match: match || null,
        error: null,
      }
    })

    const matchedCount = results.filter((r) => r.match).length
    spinner.succeed(
      `Comparison complete: ${matchedCount}/${results.length} matches found`
    )

    // Step 9: Display results
    displayResults(results, { consoleName: selectedConsole.name })

    // Additional info
    if (matchedCount > 0) {
      console.log(
        chalk.dim(
          "Tip: Matched ROMs have verified achievements on RetroAchievements.org"
        )
      )
    }

    if (results.some((r) => !r.match && !r.error)) {
      console.log(
        chalk.dim(
          "Tip: Unmatched ROMs may be different versions, hacks, or not yet in the RA database"
        )
      )
    }
  } catch (error) {
    displayError(error.message)
    if (process.env.DEBUG) {
      console.error(error)
    }
    process.exit(1)
  }
}

// Run the application
main()
