import fs from "fs"
import path from "path"
import crypto from "crypto"
import os from "os"
import { promisify } from "util"
import yauzl from "yauzl"
import Seven from "node-7z"
import { createExtractorFromData } from "node-unrar-js"

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
  ".gcm", // Gamecube
  ".gcz", // Gamecube (compressed)
  ".rvz", // Gamecube (Dolphin RVZ format)
  ".wbfs", // Wii
  ".wad", // WiiWare
  ".wux", // Wii U
  ".wud", // Wii U
  ".3ds", // Nintendo 3DS
  ".cia", // Nintendo 3DS
  ".nsp", // Nintendo Switch
  ".xci", // Nintendo Switch

  // Sega
  ".md", // Mega Drive / Genesis
  ".smd", // Mega Drive / Genesis
  ".gen", // Genesis
  ".bin", // Generic / Mega Drive / Saturn
  ".gg", // Game Gear
  ".sms", // Master System
  ".32x", // 32X
  ".sg", // SG-1000
  ".gdi", // Dreamcast
  ".cdi", // Dreamcast
  ".chd", // Compressed disc image (Dreamcast, Saturn, PSX)

  // Sony
  ".iso", // PlayStation / PSP / PS2 / PS3
  ".cue", // PlayStation / Saturn
  ".img", // PlayStation 2
  ".cso", // PSP (compressed)
  ".pbp", // PSP (EBOOT)
  ".pkg", // PS3 / PS4
  ".p3t", // PS3

  // Atari
  ".a26", // Atari 2600
  ".a78", // Atari 7800
  ".lnx", // Atari Lynx
  ".jag", // Atari Jaguar
  ".j64", // Atari Jaguar

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
])

// Archive file extensions that may contain ROMs
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar"])

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
 * Check if a file is an archive based on extension
 * @param {string} filename - Filename to check
 * @returns {boolean}
 */
function isArchiveFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ARCHIVE_EXTENSIONS.has(ext)
}

/**
 * Check if a file is a ROM or archive
 * @param {string} filename - Filename to check
 * @returns {boolean}
 */
function isRomOrArchiveFile(filename) {
  return isRomFile(filename) || isArchiveFile(filename)
}

/**
 * Calculate MD5 hash of a file
 * @param {string} filePath - Path to the file
 * @param {Object} options - Options for hashing
 * @param {Function} options.onProgress - Optional callback for progress updates
 * @returns {Promise<string>} MD5 hash in lowercase hex
 */
export function calculateMD5(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const hash = crypto.createHash("md5")
    let bytesRead = 0

    // Get file size for progress tracking
    let fileSize = 0
    try {
      const stats = fs.statSync(filePath)
      fileSize = stats.size
    } catch (err) {
      console.error(
        `[ERROR] Failed to get file stats for ${filePath}:`,
        err.message
      )
      reject(new Error(`Cannot read file stats: ${err.message}`))
      return
    }

    const stream = fs.createReadStream(filePath)

    // Set up timeout (30 minutes for very large files)
    const timeout = setTimeout(() => {
      stream.destroy()
      reject(
        new Error(`Timeout: File hashing exceeded 30 minutes for ${filePath}`)
      )
    }, 30 * 60 * 1000)

    stream.on("data", (data) => {
      bytesRead += data.length
      hash.update(data)

      // Report progress if callback provided
      if (options.onProgress && fileSize > 0) {
        const progress = (bytesRead / fileSize) * 100
        options.onProgress(progress, bytesRead, fileSize)
      }
    })

    stream.on("end", () => {
      clearTimeout(timeout)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
      const hashValue = hash.digest("hex").toLowerCase()

      if (process.env.DEBUG) {
        console.log(
          `[DEBUG] Hashed ${path.basename(filePath)} (${(
            fileSize /
            1024 /
            1024
          ).toFixed(2)} MB) in ${elapsed}s`
        )
      }

      resolve(hashValue)
    })

    stream.on("error", (err) => {
      clearTimeout(timeout)
      console.error(
        `[ERROR] Stream error while hashing ${filePath}:`,
        err.message
      )
      console.error(
        `[ERROR] Error code: ${err.code}, Error syscall: ${err.syscall}`
      )
      reject(
        new Error(
          `Failed to read file stream: ${err.message} (code: ${err.code})`
        )
      )
    })

    // Handle case where file doesn't exist or can't be opened
    stream.on("open", () => {
      if (process.env.DEBUG) {
        console.log(`[DEBUG] Started hashing: ${path.basename(filePath)}`)
      }
    })
  })
}

/**
 * Extract ROM files from a ZIP archive
 * @param {string} archivePath - Path to the ZIP archive
 * @returns {Promise<Array<{name: string, path: string}>>} Array of extracted ROM file info
 */
function extractROMsFromZip(archivePath) {
  return new Promise((resolve, reject) => {
    const extractedFiles = []
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-hash-"))

    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(new Error(`Failed to open ZIP archive: ${err.message}`))
        return
      }

      zipfile.readEntry()
      zipfile.on("entry", (entry) => {
        const ext = path.extname(entry.fileName).toLowerCase()

        // Only extract ROM files
        if (ROM_EXTENSIONS.has(ext)) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error(
                `[WARN] Failed to extract ${entry.fileName} from ZIP: ${err.message}`
              )
              zipfile.readEntry()
              return
            }

            const extractedPath = path.join(
              tempDir,
              path.basename(entry.fileName)
            )
            const writeStream = fs.createWriteStream(extractedPath)

            readStream.pipe(writeStream)

            writeStream.on("close", () => {
              extractedFiles.push({
                name: path.basename(entry.fileName),
                path: extractedPath,
                archivePath,
                tempDir,
              })
              zipfile.readEntry()
            })

            writeStream.on("error", (err) => {
              console.error(
                `[WARN] Failed to write extracted file ${entry.fileName}: ${err.message}`
              )
              zipfile.readEntry()
            })
          })
        } else {
          zipfile.readEntry()
        }
      })

      zipfile.on("end", () => {
        if (extractedFiles.length === 0) {
          // Clean up temp directory if no ROMs found
          fs.rmSync(tempDir, { recursive: true, force: true })
          resolve([])
        } else {
          resolve(extractedFiles)
        }
      })

      zipfile.on("error", (err) => {
        reject(new Error(`ZIP extraction error: ${err.message}`))
      })
    })
  })
}

/**
 * Helper function to find a file recursively in a directory
 * @param {string} dir - Directory to search
 * @param {string} filename - Filename to find
 * @returns {string|null} Full path to file or null if not found
 */
function findFileInDir(dir, filename) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === filename) {
        return fullPath
      } else if (entry.isDirectory()) {
        const found = findFileInDir(fullPath, filename)
        if (found) return found
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return null
}

/**
 * Extract ROM files from a 7Z archive using node-7z
 * @param {string} archivePath - Path to the 7Z archive
 * @returns {Promise<Array<{name: string, path: string}>>} Array of extracted ROM file info
 */
async function extractROMsFrom7z(archivePath) {
  const extractedFiles = []
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-hash-"))

  try {
    // List archive contents first
    const myStream = Seven.list(archivePath)
    const entries = []

    await new Promise((resolve, reject) => {
      myStream.on("data", (data) => {
        entries.push(data)
      })
      myStream.on("end", resolve)
      myStream.on("error", reject)
    })

    // Filter ROM files
    const romEntries = entries.filter((entry) => {
      if (entry.attr && entry.attr.includes("D")) return false // Skip directories
      const ext = path.extname(entry.name).toLowerCase()
      return ROM_EXTENSIONS.has(ext)
    })

    if (romEntries.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      return []
    }

    // Extract ROM files - extract all ROMs at once
    const romFileNames = romEntries.map((e) => e.name)
    const extractStream = Seven.extract(archivePath, tempDir, {
      $bin: Seven["7zPath"],
      $raw: romFileNames,
    })

    await new Promise((resolve, reject) => {
      extractStream.on("end", resolve)
      extractStream.on("error", reject)
    })

    // Find extracted files (7z may preserve directory structure)
    for (const entry of romEntries) {
      const baseName = path.basename(entry.name)
      // Try direct path first
      let extractedPath = path.join(tempDir, baseName)

      // If not found, search recursively
      if (!fs.existsSync(extractedPath)) {
        extractedPath = path.join(tempDir, entry.name)
      }

      // If still not found, search in tempDir
      if (!fs.existsSync(extractedPath)) {
        const searchPath = findFileInDir(tempDir, baseName)
        if (searchPath) {
          extractedPath = searchPath
        }
      }

      if (fs.existsSync(extractedPath)) {
        extractedFiles.push({
          name: baseName,
          path: extractedPath,
          archivePath,
          tempDir,
        })
      }
    }

    if (extractedFiles.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    return extractedFiles
  } catch (error) {
    // Clean up on error
    fs.rmSync(tempDir, { recursive: true, force: true }).catch(() => {})
    throw new Error(`Failed to extract 7Z archive: ${error.message}`)
  }
}

/**
 * Extract ROM files from a RAR archive
 * @param {string} archivePath - Path to the RAR archive
 * @returns {Promise<Array<{name: string, path: string}>>} Array of extracted ROM file info
 */
async function extractROMsFromRar(archivePath) {
  const extractedFiles = []
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-hash-"))

  try {
    const archiveData = fs.readFileSync(archivePath)
    const extractor = await createExtractorFromData({ data: archiveData })

    const list = extractor.getFileList()
    const fileHeaders = list[0].fileHeaders

    for (const fileHeader of fileHeaders) {
      const ext = path.extname(fileHeader.name).toLowerCase()
      if (ROM_EXTENSIONS.has(ext)) {
        const extracted = extractor.extract({ files: [fileHeader.name] })
        const extractedPath = path.join(tempDir, path.basename(fileHeader.name))
        fs.writeFileSync(extractedPath, extracted[0].files[0].extract[1])
        extractedFiles.push({
          name: path.basename(fileHeader.name),
          path: extractedPath,
          archivePath,
          tempDir,
        })
      }
    }

    if (extractedFiles.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    return extractedFiles
  } catch (error) {
    // Clean up on error
    fs.rmSync(tempDir, { recursive: true, force: true }).catch(() => {})
    throw new Error(`Failed to extract RAR archive: ${error.message}`)
  }
}

/**
 * Extract ROM files from an archive
 * @param {string} archivePath - Path to the archive file
 * @returns {Promise<Array<{name: string, path: string, archivePath: string, tempDir: string}>>} Array of extracted ROM file info
 */
async function extractROMsFromArchive(archivePath) {
  const ext = path.extname(archivePath).toLowerCase()

  if (ext === ".zip") {
    return await extractROMsFromZip(archivePath)
  } else if (ext === ".7z") {
    return await extractROMsFrom7z(archivePath)
  } else if (ext === ".rar") {
    return await extractROMsFromRar(archivePath)
  } else {
    throw new Error(`Unsupported archive format: ${ext}`)
  }
}

/**
 * Scan a directory for ROM files
 * @param {string} directory - Directory path to scan
 * @param {Object} options - Options for scanning
 * @param {Function} options.onFileStart - Optional callback when starting to hash a file
 * @param {Function} options.onFileComplete - Optional callback when finished hashing a file
 * @returns {Promise<Array>} Array of ROM info objects with filename, path, and hash
 */
export async function scanDirectory(directory, options = {}) {
  const absolutePath = path.resolve(directory)

  console.error(`[INFO] Scanning directory: ${absolutePath}`)

  if (!fs.existsSync(absolutePath)) {
    const error = `Directory not found: ${absolutePath}`
    console.error(`[ERROR] ${error}`)
    throw new Error(error)
  }

  let stats
  try {
    stats = fs.statSync(absolutePath)
  } catch (err) {
    const error = `Cannot access directory: ${absolutePath} - ${err.message}`
    console.error(`[ERROR] ${error}`)
    throw new Error(error)
  }

  if (!stats.isDirectory()) {
    const error = `Not a directory: ${absolutePath}`
    console.error(`[ERROR] ${error}`)
    throw new Error(error)
  }

  let files
  try {
    files = fs.readdirSync(absolutePath)
  } catch (err) {
    const error = `Cannot read directory: ${absolutePath} - ${err.message}`
    console.error(`[ERROR] ${error}`)
    throw new Error(error)
  }

  const romFiles = files.filter(isRomFile)
  const archiveFiles = files.filter(isArchiveFile)
  const totalFiles = romFiles.length + archiveFiles.length

  console.error(
    `[INFO] Found ${romFiles.length} ROM file(s) and ${archiveFiles.length} archive file(s) to process`
  )

  const results = []
  let processedCount = 0
  const tempDirsToCleanup = []

  // Process regular ROM files
  for (const filename of romFiles) {
    processedCount++
    const filePath = path.join(absolutePath, filename)

    console.error(
      `[INFO] [${processedCount}/${totalFiles}] Processing: ${filename}`
    )

    try {
      let fileStats
      try {
        fileStats = fs.statSync(filePath)
      } catch (err) {
        console.error(`[ERROR] Cannot stat file ${filePath}: ${err.message}`)
        throw new Error(`Cannot stat file: ${err.message}`)
      }

      if (!fileStats.isFile()) {
        console.error(`[WARN] Skipping non-file: ${filePath}`)
        results.push({
          filename,
          path: filePath,
          hash: null,
          error: "Not a regular file",
        })
        continue
      }

      const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2)
      console.error(`[INFO] File size: ${fileSizeMB} MB`)

      if (options.onFileStart) {
        options.onFileStart(filename, fileStats.size)
      }

      const hashStartTime = Date.now()
      const hash = await calculateMD5(filePath, {
        onProgress: (progress, bytesRead, totalBytes) => {
          if (process.env.DEBUG && fileStats.size > 10 * 1024 * 1024) {
            // Only log progress for files larger than 10MB
            const progressPercent = progress.toFixed(1)
            const elapsed = ((Date.now() - hashStartTime) / 1000).toFixed(1)
            console.error(
              `[DEBUG] ${filename}: ${progressPercent}% (${elapsed}s)`
            )
          }
        },
      })

      const hashTime = ((Date.now() - hashStartTime) / 1000).toFixed(2)
      console.error(`[INFO] ✓ Hashed ${filename} in ${hashTime}s`)

      if (options.onFileComplete) {
        options.onFileComplete(filename, hash)
      }

      results.push({
        filename,
        path: filePath,
        hash,
        size: fileStats.size,
      })
    } catch (error) {
      console.error(`[ERROR] Failed to process ${filename}:`, error.message)
      console.error(`[ERROR] File path: ${filePath}`)
      if (error.stack && process.env.DEBUG) {
        console.error(`[ERROR] Stack trace:`, error.stack)
      }

      // Skip files we can't read
      results.push({
        filename,
        path: filePath,
        hash: null,
        error: error.message,
      })
    }
  }

  // Process archive files
  for (const filename of archiveFiles) {
    processedCount++
    const archivePath = path.join(absolutePath, filename)

    console.error(
      `[INFO] [${processedCount}/${totalFiles}] Processing archive: ${filename}`
    )

    try {
      let archiveStats
      try {
        archiveStats = fs.statSync(archivePath)
      } catch (err) {
        console.error(
          `[ERROR] Cannot stat archive ${archivePath}: ${err.message}`
        )
        results.push({
          filename: `${filename} (archive)`,
          path: archivePath,
          hash: null,
          error: `Cannot stat archive: ${err.message}`,
        })
        continue
      }

      if (!archiveStats.isFile()) {
        console.error(`[WARN] Skipping non-file archive: ${archivePath}`)
        results.push({
          filename: `${filename} (archive)`,
          path: archivePath,
          hash: null,
          error: "Not a regular file",
        })
        continue
      }

      console.error(`[INFO] Extracting ROMs from archive...`)
      const extractedROMs = await extractROMsFromArchive(archivePath)

      if (extractedROMs.length === 0) {
        console.error(`[WARN] No ROM files found in archive: ${filename}`)
        results.push({
          filename: `${filename} (archive)`,
          path: archivePath,
          hash: null,
          error: "No ROM files found in archive",
        })
        continue
      }

      console.error(
        `[INFO] Found ${extractedROMs.length} ROM file(s) in archive`
      )

      // Track temp directory for cleanup
      if (extractedROMs.length > 0 && extractedROMs[0].tempDir) {
        tempDirsToCleanup.push(extractedROMs[0].tempDir)
      }

      // Hash each extracted ROM
      for (const rom of extractedROMs) {
        const displayName = `${filename}/${rom.name}`
        console.error(`[INFO] Processing: ${displayName}`)

        try {
          let romStats
          try {
            romStats = fs.statSync(rom.path)
          } catch (err) {
            console.error(
              `[ERROR] Cannot stat extracted ROM ${rom.path}: ${err.message}`
            )
            results.push({
              filename: displayName,
              path: archivePath,
              hash: null,
              error: `Cannot stat extracted ROM: ${err.message}`,
            })
            continue
          }

          const fileSizeMB = (romStats.size / 1024 / 1024).toFixed(2)
          console.error(`[INFO] File size: ${fileSizeMB} MB`)

          if (options.onFileStart) {
            options.onFileStart(displayName, romStats.size)
          }

          const hashStartTime = Date.now()
          const hash = await calculateMD5(rom.path, {
            onProgress: (progress, bytesRead, totalBytes) => {
              if (process.env.DEBUG && romStats.size > 10 * 1024 * 1024) {
                const progressPercent = progress.toFixed(1)
                const elapsed = ((Date.now() - hashStartTime) / 1000).toFixed(1)
                console.error(
                  `[DEBUG] ${displayName}: ${progressPercent}% (${elapsed}s)`
                )
              }
            },
          })

          const hashTime = ((Date.now() - hashStartTime) / 1000).toFixed(2)
          console.error(`[INFO] ✓ Hashed ${displayName} in ${hashTime}s`)

          if (options.onFileComplete) {
            options.onFileComplete(displayName, hash)
          }

          results.push({
            filename: displayName,
            path: archivePath,
            hash,
            size: romStats.size,
            archiveName: filename,
            romName: rom.name,
          })
        } catch (error) {
          console.error(
            `[ERROR] Failed to hash extracted ROM ${rom.name}:`,
            error.message
          )
          results.push({
            filename: displayName,
            path: archivePath,
            hash: null,
            error: error.message,
          })
        }
      }
    } catch (error) {
      console.error(
        `[ERROR] Failed to process archive ${filename}:`,
        error.message
      )
      console.error(`[ERROR] Archive path: ${archivePath}`)
      if (error.stack && process.env.DEBUG) {
        console.error(`[ERROR] Stack trace:`, error.stack)
      }

      results.push({
        filename: `${filename} (archive)`,
        path: archivePath,
        hash: null,
        error: error.message,
      })
    }
  }

  // Clean up temporary directories
  for (const tempDir of tempDirsToCleanup) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        if (process.env.DEBUG) {
          console.error(`[DEBUG] Cleaned up temp directory: ${tempDir}`)
        }
      }
    } catch (err) {
      console.error(
        `[WARN] Failed to clean up temp directory ${tempDir}: ${err.message}`
      )
    }
  }

  console.error(
    `[INFO] Completed scanning: ${results.length} file(s) processed`
  )
  return results
}

/**
 * Get list of ROM files without hashing (for preview)
 * Includes ROMs from archives
 * @param {string} directory - Directory path to scan
 * @returns {Promise<Array>} Array of ROM filenames (includes archive/rom format)
 */
export async function listRomFiles(directory) {
  const absolutePath = path.resolve(directory)

  if (!fs.existsSync(absolutePath)) {
    return []
  }

  const files = fs.readdirSync(absolutePath)
  const romFiles = files.filter(isRomFile)
  const archiveFiles = files.filter(isArchiveFile)
  const result = [...romFiles]

  // List ROMs from archives (without extracting)
  for (const archiveFile of archiveFiles) {
    const archivePath = path.join(absolutePath, archiveFile)
    try {
      const ext = path.extname(archiveFile).toLowerCase()
      let romNames = []

      if (ext === ".zip") {
        // For ZIP, we need to open it to list contents
        romNames = await new Promise((resolve, reject) => {
          const roms = []
          yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
              resolve([]) // Skip if can't open
              return
            }

            zipfile.readEntry()
            zipfile.on("entry", (entry) => {
              const entryExt = path.extname(entry.fileName).toLowerCase()
              if (ROM_EXTENSIONS.has(entryExt)) {
                roms.push(`${archiveFile}/${path.basename(entry.fileName)}`)
              }
              zipfile.readEntry()
            })

            zipfile.on("end", () => {
              resolve(roms)
            })

            zipfile.on("error", () => {
              resolve([])
            })
          })
        })
      } else if (ext === ".7z") {
        // For 7Z, use node-7z to list contents
        try {
          const myStream = Seven.list(archivePath)
          const entries = []

          await new Promise((resolve, reject) => {
            myStream.on("data", (data) => {
              entries.push(data)
            })
            myStream.on("end", resolve)
            myStream.on("error", reject)
          })

          for (const entry of entries) {
            if (entry.attr && entry.attr.includes("D")) continue // Skip directories
            const entryExt = path.extname(entry.name).toLowerCase()
            if (ROM_EXTENSIONS.has(entryExt)) {
              romNames.push(`${archiveFile}/${path.basename(entry.name)}`)
            }
          }
        } catch (err) {
          // Skip if can't read
        }
      } else if (ext === ".rar") {
        // For RAR, we'd need to read the file to list contents
        // For now, just indicate the archive exists
        // Full extraction will happen during scanning
        romNames.push(`${archiveFile}/*`)
      }

      result.push(...romNames)
    } catch (err) {
      // Skip archives we can't read
      if (process.env.DEBUG) {
        console.error(
          `[DEBUG] Could not list contents of ${archiveFile}: ${err.message}`
        )
      }
    }
  }

  return result
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
  ".gcm": ["Gamecube", "GameCube", "NGC"],
  ".gcz": ["Gamecube", "GameCube", "NGC"],
  ".rvz": ["Gamecube", "GameCube", "NGC"],
  ".wbfs": ["Wii", "Nintendo Wii"],
  ".wad": ["Wii", "Nintendo Wii"],
  ".wux": ["Wii U", "Nintendo Wii U"],
  ".wud": ["Wii U", "Nintendo Wii U"],
  ".3ds": ["Nintendo 3DS", "3DS"],
  ".cia": ["Nintendo 3DS", "3DS"],
  ".nsp": ["Nintendo Switch", "Switch"],
  ".xci": ["Nintendo Switch", "Switch"],

  // Sega
  ".md": ["Mega Drive", "Genesis"],
  ".smd": ["Mega Drive", "Genesis"],
  ".gen": ["Mega Drive", "Genesis"],
  ".bin": ["Mega Drive", "Genesis", "Saturn"], // Common for Genesis and Saturn
  ".gg": ["Game Gear", "GG"],
  ".sms": ["Master System", "SMS"],
  ".32x": ["32X", "Sega 32X"],
  ".sg": ["SG-1000", "SG1000"],
  ".gdi": ["Dreamcast", "Sega Dreamcast"],
  ".cdi": ["Dreamcast", "Sega Dreamcast"],

  // Sony
  ".iso": [
    "PlayStation",
    "PSX",
    "PlayStation Portable",
    "PSP",
    "PlayStation 2",
    "PS2",
  ],
  ".cue": ["PlayStation", "PSX", "Saturn"],
  ".chd": ["PlayStation", "PSX", "Dreamcast", "Saturn"],
  ".img": ["PlayStation 2", "PS2"],
  ".cso": ["PlayStation Portable", "PSP"],
  ".pbp": ["PlayStation Portable", "PSP"],

  // Atari
  ".a26": ["Atari 2600", "A26"],
  ".a78": ["Atari 7800", "A78"],
  ".lnx": ["Atari Lynx", "Lynx"],
  ".jag": ["Atari Jaguar", "Jaguar"],
  ".j64": ["Atari Jaguar", "Jaguar"],

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
 * Helper function to match console names (case-insensitive, partial match)
 * @param {string} consoleName - Console name from API
 * @param {Array<string>} possibleNames - Array of possible console name variations
 * @returns {boolean} True if there's a match
 */
function matchConsoleName(consoleName, possibleNames) {
  const consoleNameLower = consoleName.toLowerCase().trim()

  for (const possibleName of possibleNames) {
    const possibleLower = possibleName.toLowerCase().trim()

    // Direct substring match
    if (
      consoleNameLower.includes(possibleLower) ||
      possibleLower.includes(consoleNameLower)
    ) {
      return true
    }

    // Handle common variations (e.g., "Nintendo Entertainment System" vs "NES")
    // Remove common words and compare
    const consoleWords = consoleNameLower
      .split(/\s+/)
      .filter((w) => w.length > 2)
    const possibleWords = possibleLower.split(/\s+/).filter((w) => w.length > 2)

    // Check if significant words match
    const matchingWords = consoleWords.filter((w) =>
      possibleWords.some((pw) => pw.includes(w) || w.includes(pw))
    )

    if (
      matchingWords.length > 0 &&
      matchingWords.length >=
        Math.min(consoleWords.length, possibleWords.length) / 2
    ) {
      return true
    }
  }

  return false
}

/**
 * Suggest a console based on folder name and ROM file extensions found
 * @param {string} directory - Directory path being scanned
 * @param {Array<string>} romFiles - Array of ROM filenames
 * @param {Array<Object>} consoles - Array of console objects from RA API
 * @returns {Object|null} Suggested console object or null if no match
 */
export function suggestConsole(directory, romFiles, consoles) {
  if (
    !romFiles ||
    romFiles.length === 0 ||
    !consoles ||
    consoles.length === 0
  ) {
    return null
  }

  // Step 1: Check folder name first for console hints
  if (directory) {
    const folderName = path.basename(path.resolve(directory)).toLowerCase()

    // Common folder name patterns that might indicate console
    const folderKeywords = [
      "nes",
      "nintendo entertainment system",
      "snes",
      "super nintendo",
      "super nintendo entertainment system",
      "n64",
      "nintendo 64",
      "gamecube",
      "game cube",
      "ngc",
      "gc",
      "wii",
      "wiiu",
      "wii u",
      "3ds",
      "nintendo 3ds",
      "switch",
      "nintendo switch",
      "gb",
      "game boy",
      "gbc",
      "game boy color",
      "gba",
      "game boy advance",
      "ds",
      "nintendo ds",
      "genesis",
      "mega drive",
      "megadrive",
      "sega",
      "master system",
      "sms",
      "game gear",
      "gg",
      "dreamcast",
      "saturn",
      "32x",
      "sega 32x",
      "playstation",
      "psx",
      "ps1",
      "ps2",
      "playstation 2",
      "psp",
      "playstation portable",
      "ps3",
      "playstation 3",
      "atari 2600",
      "a26",
      "atari 7800",
      "a78",
      "lynx",
      "jaguar",
      "turbografx",
      "pc engine",
      "pce",
      "neo geo",
      "ngp",
      "wonderswan",
      "colecovision",
      "intellivision",
      "vectrex",
    ]

    // Try to match folder name with console names
    for (const console of consoles) {
      const consoleNameLower = console.name.toLowerCase().trim()

      // Check if folder name contains console name or vice versa
      if (
        folderName.includes(consoleNameLower) ||
        consoleNameLower.includes(folderName)
      ) {
        return console
      }

      // Check against keywords
      for (const keyword of folderKeywords) {
        if (
          folderName.includes(keyword) &&
          (consoleNameLower.includes(keyword) ||
            keyword.includes(consoleNameLower.split(/\s+/)[0]))
        ) {
          return console
        }
      }
    }
  }

  // Step 2: Fall back to extension-based matching
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

  // Try to find a matching console
  for (const console of consoles) {
    if (matchConsoleName(console.name, possibleNames)) {
      return console
    }
  }

  return null
}
