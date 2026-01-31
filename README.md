# SMS (Script Management System)

Git-backed alias system for managing scripts. Run scripts by stable alias regardless of file location.

## Installation

```bash
# Clone or copy this repository
git clone <repo>
cd sms-cli

# Install dependencies
bun install

# Optional: Create symlink for global access
ln -sf "$(pwd)/sms.ts" ~/.local/bin/sms
```

## Quick Start

```bash
# Add a script with an alias
sms add ./myscript.py --alias etl

# Run it from anywhere
sms run etl --input data.csv

# Move it to organize
sms mv etl utils/

# List all scripts
sms list

# Check for issues
sms doctor
```

## Problem Statement

Local script execution is fragile:
1. **Fragile Paths**: Scripts break when moved (`./old_proj/v2/etl.py` -> `./analytics/etl.py`)
2. **Hard to Manage**: No central registry, scripts scattered across projects
3. **No Versioning**: Accidental overwrites, no history of changes

## Features

- **Git-backed**: Every change is committed to `~/.sms/` repository
- **Path abstraction**: Scripts are referenced by alias, not file path
- **Auto-detection**: Automatically detects bash/python scripts
- **Health checks**: Built-in `doctor` command detects broken paths

## Commands

| Command | Description |
|---------|-------------|
| `sms add <file> --alias <name>` | Add a script with an alias |
| `sms run <alias> [args...]` | Execute a script by alias |
| `sms mv <alias> <folder>/` | Move script to subfolder |
| `sms rm <alias>` | Remove a script |
| `sms list` | Show all registered scripts |
| `sms doctor` | Detect broken paths |
| `sms help` | Show help |

## Implementation

Built with Bun + TypeScript.

- `sms.ts` - Main CLI implementation
- `types.ts` - Type definitions
- `~/.sms/index.json` - Maps aliases to relative paths
- `~/.sms/scripts/` - Script storage

## Project Structure

```
~/.sms/
├── .git/           # Git repository
├── index.json      # Alias mappings
└── scripts/        # Script storage
```

Each operation is automatically committed to git, providing full history of changes.