import {
  buildAuthorization,
  getConsoleIds,
  getGameList,
} from "@retroachievements/api"

/**
 * Create an authorization object for RA API calls
 * @param {Object} credentials - Object with username and apiKey
 * @returns {Object} Authorization object
 */
export function createAuthorization(credentials) {
  return buildAuthorization({
    username: credentials.username,
    webApiKey: credentials.apiKey,
  })
}

/**
 * Fetch all console IDs from RetroAchievements
 * @param {Object} authorization - Authorization object from createAuthorization
 * @returns {Promise<Array>} Array of console objects with id and name
 */
export async function getConsoles(authorization) {
  const consoles = await getConsoleIds(authorization)

  // Filter out non-game systems and sort by name
  const gameConsoles = consoles
    .filter(
      (c) =>
        !c.name.toLowerCase().includes("hub") &&
        !c.name.toLowerCase().includes("event")
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return gameConsoles
}

/**
 * Fetch all games with hashes for a specific console
 * @param {Object} authorization - Authorization object
 * @param {number} consoleId - Console ID to fetch games for
 * @returns {Promise<Map>} Map of MD5 hashes to game info
 */
export async function getGameHashes(authorization, consoleId) {
  const games = await getGameList(authorization, {
    consoleId: consoleId,
    shouldOnlyRetrieveGamesWithAchievements: true,
    shouldRetrieveGameHashes: true,
  })

  // Build a hash lookup map for efficient searching
  const hashMap = new Map()

  for (const game of games) {
    // Each game may have multiple hashes
    if (game.hashes && Array.isArray(game.hashes)) {
      for (const hash of game.hashes) {
        const normalizedHash = hash.toLowerCase()
        hashMap.set(normalizedHash, {
          id: game.id,
          title: game.title,
          numAchievements: game.numAchievements || 0,
          numLeaderboards: game.numLeaderboards || 0,
          imageIcon: game.imageIcon,
        })
      }
    }
  }

  return hashMap
}

/**
 * Get total game count and hash count for statistics
 * @param {Object} authorization - Authorization object
 * @param {number} consoleId - Console ID
 * @returns {Promise<Object>} Object with gameCount and hashCount
 */
export async function getGameStats(authorization, consoleId) {
  const games = await getGameList(authorization, {
    consoleId: consoleId,
    shouldOnlyRetrieveGamesWithAchievements: true,
    shouldRetrieveGameHashes: true,
  })

  let hashCount = 0
  for (const game of games) {
    if (game.hashes && Array.isArray(game.hashes)) {
      hashCount += game.hashes.length
    }
  }

  return {
    gameCount: games.length,
    hashCount,
  }
}
