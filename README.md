# RetroAchievements ROM Hash Checker

A CLI tool that checks ROM file MD5 hashes against the RetroAchievements database to see if your ROMs match games with achievements.

## Features

- 🎮 Check ROM hashes against RetroAchievements database
- 📊 Beautiful tabular output with color-coded results
- 💾 Saves API credentials locally for future use
- 🔍 Supports 50+ ROM file extensions across all major systems
- ⚡ Fast MD5 hash calculation

## Installation

```bash
# Clone or download this repository
cd retro-hash-report

# Install dependencies
npm install

# Run the tool
npm start

# Or run directly
node src/index.js
```

### Global Installation

To install as a global CLI command:

```bash
npm link
```

Then you can run `ra-hash` from anywhere.

## Usage

### Basic Usage

```bash
# Scan current directory
npm start

# Or with global install
ra-hash
```

### Options

```bash
ra-hash --path /path/to/roms       # Specify ROM directory
ra-hash --system 3                  # Skip console selection (SNES = 3)
ra-hash --help                      # Show help
```

### First Run

On first run, you'll be prompted for your RetroAchievements credentials:

1. **Username**: Your RetroAchievements account username
2. **API Key**: Found at https://retroachievements.org/settings

Credentials are saved to `~/.retrohash-config.json` for future use.

## Workflow

1. Place tool or navigate to your ROM folder
2. Run `ra-hash` or `npm start`
3. Enter/confirm your RetroAchievements credentials
4. Select the game system from the list
5. View results showing which ROMs match games with achievements

## Output Example

```
┌───────────────────────────────────┬────────────────────────────┬──────────────┐
│ ROM File                          │ RA Match                   │ Achievements │
├───────────────────────────────────┼────────────────────────────┼──────────────┤
│ Super Mario World.sfc             │ Super Mario World          │ 96           │
│ zelda.sfc                         │ Legend of Zelda: A Link... │ 128          │
│ unknown_rom.sfc                   │ ✗ No match found           │ -            │
└───────────────────────────────────┴────────────────────────────┴──────────────┘

Summary
────────────────────────────────────────
  ● Matched:   2 ROMs
  ● Unmatched: 1 ROMs
────────────────────────────────────────
  Total:     3 ROMs scanned
  Match Rate: 66.7%
```

## Supported File Extensions

The tool recognizes ROM files with these extensions:

| System | Extensions |
|--------|------------|
| NES | `.nes`, `.fds` |
| SNES | `.sfc`, `.smc` |
| Game Boy | `.gb`, `.gbc`, `.gba` |
| Nintendo 64 | `.n64`, `.z64`, `.v64` |
| Sega Genesis/MD | `.md`, `.smd`, `.gen`, `.bin` |
| Master System | `.sms` |
| Game Gear | `.gg` |
| PlayStation | `.iso`, `.cue`, `.chd` |
| PC Engine | `.pce` |
| Atari | `.a26`, `.a78`, `.lnx` |
| And more... | `.rom`, `.zip`, `.7z` |

## Why Hashes Don't Match

If your ROM shows "No match found", it could be because:

- **Different ROM version**: US vs EU vs JP releases have different hashes
- **ROM hack or modification**: Modified ROMs have different hashes
- **Bad dump**: Your ROM may be improperly dumped
- **Not in RA database**: The game may not have achievements yet
- **Compressed format**: Some compressed formats aren't supported

## API Rate Limits

The RetroAchievements API has rate limits. The tool fetches all data for a console in a single request to minimize API calls.

## License

MIT

