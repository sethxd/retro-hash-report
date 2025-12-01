import chalk from "chalk"
import Table from "cli-table3"
import { formatSize } from "./scanner.js"

/**
 * Display results in a formatted table
 * @param {Array} results - Array of result objects from comparison
 * @param {Object} options - Display options
 */
export function displayResults(results, options = {}) {
  const { consoleName = "Unknown System" } = options

  // Separate matched and unmatched
  const matched = results.filter((r) => r.match)
  const unmatched = results.filter((r) => !r.match)
  const errors = results.filter((r) => r.error)

  console.log("\n")
  console.log(chalk.bold.cyan("━".repeat(70)))
  console.log(
    chalk.bold.cyan(`  🎮 RetroAchievements Hash Report - ${consoleName}`)
  )
  console.log(chalk.bold.cyan("━".repeat(70)))
  console.log("\n")

  // Create table
  const table = new Table({
    head: [
      chalk.bold.white("ROM File"),
      chalk.bold.white("RA Match"),
      chalk.bold.white("Achievements"),
    ],
    colWidths: [35, 28, 14],
    style: {
      head: [],
      border: ["gray"],
    },
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
  })

  // Sort: matched first (sorted by game title), then unmatched (sorted by filename)
  const sortedMatched = [...matched].sort((a, b) =>
    (a.match?.title || "").localeCompare(b.match?.title || "")
  )
  const sortedUnmatched = [...unmatched].sort((a, b) =>
    a.filename.localeCompare(b.filename)
  )

  // Add matched rows
  for (const result of sortedMatched) {
    const filename = truncateString(result.filename, 33)
    const title = truncateString(result.match.title, 26)
    const achievements = result.match.numAchievements

    table.push([
      chalk.green(filename),
      chalk.green(title),
      chalk.green.bold(achievements.toString()),
    ])
  }

  // Add unmatched rows
  for (const result of sortedUnmatched) {
    if (result.error) {
      table.push([
        chalk.red(truncateString(result.filename, 33)),
        chalk.red("⚠ Error reading file"),
        chalk.dim("-"),
      ])
    } else {
      table.push([
        chalk.yellow(truncateString(result.filename, 33)),
        chalk.yellow("✗ No match found"),
        chalk.dim("-"),
      ])
    }
  }

  console.log(table.toString())

  // Summary section
  console.log("\n")
  displaySummary(
    matched.length,
    unmatched.length - errors.length,
    errors.length
  )
}

/**
 * Display summary statistics
 * @param {number} matched - Number of matched ROMs
 * @param {number} unmatched - Number of unmatched ROMs
 * @param {number} errors - Number of error ROMs
 */
function displaySummary(matched, unmatched, errors) {
  const total = matched + unmatched + errors
  const matchRate = total > 0 ? ((matched / total) * 100).toFixed(1) : 0

  console.log(chalk.bold("Summary"))
  console.log(chalk.dim("─".repeat(40)))

  console.log(
    `  ${chalk.green("●")} Matched:   ${chalk.green.bold(matched)} ROMs`
  )
  console.log(
    `  ${chalk.yellow("●")} Unmatched: ${chalk.yellow.bold(unmatched)} ROMs`
  )
  if (errors > 0) {
    console.log(`  ${chalk.red("●")} Errors:    ${chalk.red.bold(errors)} ROMs`)
  }
  console.log(chalk.dim("─".repeat(40)))
  console.log(`  Total:     ${chalk.bold(total)} ROMs scanned`)
  console.log(`  Match Rate: ${chalk.cyan.bold(matchRate + "%")}`)
  console.log("\n")
}

/**
 * Display a header banner
 * @param {string} text - Header text
 */
export function displayHeader(text) {
  console.log("\n")
  console.log(chalk.bold.magenta("╔" + "═".repeat(68) + "╗"))
  console.log(
    chalk.bold.magenta("║") +
      chalk.bold.white(centerString(text, 68)) +
      chalk.bold.magenta("║")
  )
  console.log(chalk.bold.magenta("╚" + "═".repeat(68) + "╝"))
  console.log("\n")
}

/**
 * Display info about the scan before starting
 * @param {string} directory - Directory being scanned
 * @param {number} romCount - Number of ROMs found
 * @param {string} consoleName - Selected console name
 */
export function displayScanInfo(directory, romCount, consoleName) {
  console.log("\n")
  console.log(chalk.dim("─".repeat(50)))
  console.log(`  ${chalk.bold("Directory:")}  ${chalk.cyan(directory)}`)
  console.log(`  ${chalk.bold("System:")}     ${chalk.cyan(consoleName)}`)
  console.log(
    `  ${chalk.bold("ROMs Found:")} ${chalk.cyan(romCount.toString())}`
  )
  console.log(chalk.dim("─".repeat(50)))
  console.log("\n")
}

/**
 * Display API stats
 * @param {number} gameCount - Number of games with achievements
 * @param {number} hashCount - Number of known hashes
 */
export function displayApiStats(gameCount, hashCount) {
  console.log(
    chalk.dim(
      `  RetroAchievements: ${gameCount} games, ${hashCount} known hashes`
    )
  )
}

/**
 * Truncate string to max length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncateString(str, maxLength) {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + "..."
}

/**
 * Center a string within a given width
 * @param {string} str - String to center
 * @param {number} width - Total width
 * @returns {string}
 */
function centerString(str, width) {
  const padding = Math.max(0, width - str.length)
  const leftPad = Math.floor(padding / 2)
  const rightPad = padding - leftPad
  return " ".repeat(leftPad) + str + " ".repeat(rightPad)
}

/**
 * Display an error message
 * @param {string} message - Error message
 */
export function displayError(message) {
  console.log(chalk.red.bold("\n✗ Error: ") + chalk.red(message) + "\n")
}

/**
 * Display a success message
 * @param {string} message - Success message
 */
export function displaySuccess(message) {
  console.log(chalk.green.bold("\n✓ ") + chalk.green(message) + "\n")
}
