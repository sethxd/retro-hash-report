import fs from "fs"
import path from "path"
import crypto from "crypto"

// Common ROM file extensions by system
const ROM_EXTENSIONS = new Set([
  // Nintendo
  ".nes", // NES
  ".fds", // Famicom Disk System
  ".sfc", // SNES
  ".smc", // SNES
  ".gb", // Game Boy
  ".gbc", // Game Boy Color
  ".gba", // Game Boy Advance
  ".nds", // Nintendo DS
  ".n64", // Nintendo 64
  ".z64", // Nintendo 64
  ".v64", // Nintendo 64

  // Sega
  ".md", // Mega Drive / Genesis
  ".smd", // Mega Drive / Genesis
  ".gen", // Genesis
  ".bin", // Generic / Mega Drive
  ".gg", // Game Gear
  ".sms", // Master System
  ".32x", // 32X
  ".sg", // SG-1000

  // Sony
  ".iso", // PlayStation / PSP
  ".cue", // PlayStation
  ".chd", // Compressed disc image

  // Atari
  ".a26", // Atari 2600
  ".a78", // Atari 7800
  ".lnx", // Atari Lynx
  ".jag", // Atari Jaguar

  // Other
  ".pce", // PC Engine / TurboGrafx
  ".ngp", // Neo Geo Pocket
  ".ngc", // Neo Geo Pocket Color
  ".ws", // WonderSwan
  ".wsc", // WonderSwan Color
  ".col", // ColecoVision
  ".int", // Intellivision
  ".vec", // Vectrex
  ".min", // Pokemon Mini
  ".vb", // Virtual Boy
  ".rom", // Generic ROM
  ".zip", // Compressed (if user wants to scan zips)
  ".7z", // Compressed
])

/**
 * Check if a file is a ROM based on extension
 * @param {string} filename - Filename to check
 * @returns {boolean}
 */
function isRomFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ROM_EXTENSIONS.has(ext)
}

/**
 * Calculate MD5 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} MD5 hash in lowercase hex
 */
export function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5")
    const stream = fs.createReadStream(filePath)

    stream.on("data", (data) => hash.update(data))
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()))
    stream.on("error", (err) => reject(err))
  })
}

/**
 * Scan a directory for ROM files
 * @param {string} directory - Directory path to scan
 * @returns {Promise<Array>} Array of ROM info objects with filename, path, and hash
 */
export async function scanDirectory(directory) {
  const absolutePath = path.resolve(directory)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Directory not found: ${absolutePath}`)
  }

  const stats = fs.statSync(absolutePath)
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${absolutePath}`)
  }

  const files = fs.readdirSync(absolutePath)
  const romFiles = files.filter(isRomFile)

  const results = []

  for (const filename of romFiles) {
    const filePath = path.join(absolutePath, filename)

    try {
      const fileStats = fs.statSync(filePath)
      if (fileStats.isFile()) {
        const hash = await calculateMD5(filePath)
        results.push({
          filename,
          path: filePath,
          hash,
          size: fileStats.size,
        })
      }
    } catch (error) {
      // Skip files we can't read
      results.push({
        filename,
        path: filePath,
        hash: null,
        error: error.message,
      })
    }
  }

  return results
}

/**
 * Get list of ROM files without hashing (for preview)
 * @param {string} directory - Directory path to scan
 * @returns {Array} Array of ROM filenames
 */
export function listRomFiles(directory) {
  const absolutePath = path.resolve(directory)

  if (!fs.existsSync(absolutePath)) {
    return []
  }

  const files = fs.readdirSync(absolutePath)
  return files.filter(isRomFile)
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB"
}

/**
 * Mapping of file extensions to RetroAchievements console names
 * This maps common ROM extensions to console names as they appear in the RA API
 */
const EXTENSION_TO_CONSOLE = {
  // Nintendo
  ".nes": ["Nintendo Entertainment System", "NES"],
  ".fds": ["Nintendo Entertainment System", "NES"],
  ".sfc": ["Super Nintendo Entertainment System", "SNES"],
  ".smc": ["Super Nintendo Entertainment System", "SNES"],
  ".gb": ["Game Boy", "GB"],
  ".gbc": ["Game Boy Color", "GBC"],
  ".gba": ["Game Boy Advance", "GBA"],
  ".nds": ["Nintendo DS", "NDS"],
  ".n64": ["Nintendo 64", "N64"],
  ".z64": ["Nintendo 64", "N64"],
  ".v64": ["Nintendo 64", "N64"],

  // Sega
  ".md": ["Mega Drive", "Genesis"],
  ".smd": ["Mega Drive", "Genesis"],
  ".gen": ["Mega Drive", "Genesis"],
  ".bin": ["Mega Drive", "Genesis"], // Common for Genesis
  ".gg": ["Game Gear", "GG"],
  ".sms": ["Master System", "SMS"],
  ".32x": ["32X", "Sega 32X"],
  ".sg": ["SG-1000", "SG1000"],

  // Sony
  ".iso": ["PlayStation", "PSX"], // Could also be PSP, but PSX is more common
  ".cue": ["PlayStation", "PSX"],
  ".chd": ["PlayStation", "PSX"],

  // Atari
  ".a26": ["Atari 2600", "A26"],
  ".a78": ["Atari 7800", "A78"],
  ".lnx": ["Atari Lynx", "Lynx"],
  ".jag": ["Atari Jaguar", "Jaguar"],

  // Other
  ".pce": ["TurboGrafx-16", "PC Engine"],
  ".ngp": ["Neo Geo Pocket", "NGP"],
  ".ngc": ["Neo Geo Pocket Color", "NGPC"],
  ".ws": ["WonderSwan", "WS"],
  ".wsc": ["WonderSwan Color", "WSC"],
  ".col": ["ColecoVision", "CV"],
  ".int": ["Intellivision", "INT"],
  ".vec": ["Vectrex", "VEC"],
  ".min": ["Pokemon Mini", "PM"],
  ".vb": ["Virtual Boy", "VB"],
}

/**
 * Suggest a console based on ROM file extensions found
 * @param {Array<string>} romFiles - Array of ROM filenames
 * @param {Array<Object>} consoles - Array of console objects from RA API
 * @returns {Object|null} Suggested console object or null if no match
 */
export function suggestConsole(romFiles, consoles) {
  if (
    !romFiles ||
    romFiles.length === 0 ||
    !consoles ||
    consoles.length === 0
  ) {
    return null
  }

  // Count extensions found
  const extensionCounts = new Map()

  for (const filename of romFiles) {
    const ext = path.extname(filename).toLowerCase()
    extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1)
  }

  // Find the most common extension
  let mostCommonExt = null
  let maxCount = 0

  for (const [ext, count] of extensionCounts) {
    if (count > maxCount) {
      maxCount = count
      mostCommonExt = ext
    }
  }

  if (!mostCommonExt || !EXTENSION_TO_CONSOLE[mostCommonExt]) {
    return null
  }

  // Get possible console names for this extension
  const possibleNames = EXTENSION_TO_CONSOLE[mostCommonExt]

  // Try to find a matching console (case-insensitive, partial match)
  for (const console of consoles) {
    const consoleNameLower = console.name.toLowerCase().trim()

    for (const possibleName of possibleNames) {
      const possibleLower = possibleName.toLowerCase().trim()

      // Direct substring match
      if (
        consoleNameLower.includes(possibleLower) ||
        possibleLower.includes(consoleNameLower)
      ) {
        return console
      }

      // Handle common variations (e.g., "Nintendo Entertainment System" vs "NES")
      // Remove common words and compare
      const consoleWords = consoleNameLower
        .split(/\s+/)
        .filter((w) => w.length > 2)
      const possibleWords = possibleLower
        .split(/\s+/)
        .filter((w) => w.length > 2)

      // Check if significant words match
      const matchingWords = consoleWords.filter((w) =>
        possibleWords.some((pw) => pw.includes(w) || w.includes(pw))
      )

      if (
        matchingWords.length > 0 &&
        matchingWords.length >=
          Math.min(consoleWords.length, possibleWords.length) / 2
      ) {
        return console
      }
    }
  }

  return null
}
