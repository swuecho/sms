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
| `sms add <file> --alias <name> [--env "K=V,FOO=BAR"]` | Add a script with an alias |
| `sms run <alias> [args...]` | Execute a script by alias |
| `sms rm <alias>` | Remove a script |
| `sms init <name> --type <bash|python|ts> [--alias <name>] [--location <cwd|sms>] [--no-add] [--force]` | Create a script template |
| `sms list` | Show all registered scripts |
| `sms doctor` | Detect broken paths |
| `sms help` | Show help |

Note: `sms update <alias> [--env "K=V,FOO=BAR"]` updates script env metadata.

## Script Writing Guidelines (LLM-Friendly)

Most scripts will be authored by an LLM. To keep them reliable, safe, and easy to run via `sms`, follow these rules:

1. **One entrypoint**: Provide a `main()` (or equivalent) and call it under `if __name__ == "__main__":`.
2. **Deterministic defaults**: No interactive prompts unless explicitly requested. Prefer flags and stdin.
3. **Clear help**: Support `-h/--help` with a usage banner, options, and examples.
4. **Strict argument validation**: Reject unknown flags and missing required args with a non-zero exit code.
5. **Exit codes**:
   - `0` success
   - `1` general failure
   - `2` CLI usage error (bad args)
6. **Logging**: Write human-readable status/errors to stderr. Write machine output to stdout.
7. **No global side effects**: Avoid writing outside the working directory unless a flag explicitly allows it.
8. **Idempotent where possible**: Running the script twice should not corrupt data or silently change behavior.
9. **Self contained**: Prefer scripts that run without extra setup. For Python, use `uv` and include a PEP 723 header so dependencies install automatically.
10. **Portable paths**: Use relative paths or env vars; do not assume a fixed filesystem layout.

## Expected Script Format (How to Write a Script)

Scripts can be written in Bash, Python, or any executable language. They should follow this structure:

1. **Shebang** (for executable scripts)
2. **Short description**
3. **Argument parsing**
4. **Validation**
5. **Core logic**
6. **Output**
7. **Exit**

### Help Message Format

Your script should output help like this:

```
Usage:
  myscript [options] <input>

Options:
  -o, --output <path>   Output file (default: stdout)
  -q, --quiet           Suppress non-error logs
  -h, --help            Show this help

Examples:
  myscript data.csv
  myscript -o out.json data.csv
```

### Parsing Command Line Input

#### Bash (manual parsing)

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  myscript [options] <input>

Options:
  -o, --output <path>   Output file (default: stdout)
  -q, --quiet           Suppress non-error logs
  -h, --help            Show this help
EOF
}

output=""
quiet="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      output="${2:-}"
      shift 2
      ;;
    -q|--quiet)
      quiet="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Error: Unknown option $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

input="${1:-}"
if [[ -z "$input" ]]; then
  echo "Error: Missing <input>" >&2
  usage >&2
  exit 2
fi

# Core logic here
```

#### Python (argparse)

```python
#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "requests>=2.31",
# ]
# ///
import argparse
import sys

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="myscript",
        description="Transform input data into JSON output."
    )
    parser.add_argument("input", help="Input file path")
    parser.add_argument("-o", "--output", help="Output file (default: stdout)")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error logs")
    return parser

def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    # Validate args if needed
    # Core logic here
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

### Notes for `sms`

- `sms run <alias> ...` passes arguments through to your script unchanged.
- Ensure your script is executable (or has a correct interpreter). For Python, a shebang is recommended.

### Parameter Guidelines (Best Practices)

Use flags for optional behavior and positional args for required inputs. Prefer stdin for large payloads.

- **Positional args**: required inputs only (e.g., `myscript <input>`).
- **Flags**: optional settings (`--output`, `--format`, `--limit`, `--dry-run`).
- **Stdin**: for bulk data or pipelines (`cat data.csv | myscript --format json`).
- **Env vars**: optional overrides (documented, not required).
- **Validation**: fail fast on missing/invalid args; exit code `2` for usage errors.

Examples:
```
sms run etl --input data.csv --output out.json --limit 100
cat data.csv | sms run etl --format json
```

#### Bash stdin vs flags

```bash
input=""
format="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      input="${2:-}"
      shift 2
      ;;
    --format)
      format="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$input" ]]; then
  data="$(cat "$input")"
else
  # If no file provided, read stdin
  data="$(cat)"
fi

# Process $data with $format
```

#### Python stdin vs flags

```python
import sys

parser.add_argument("--input", help="Input file path (default: stdin)")
parser.add_argument("--format", default="text")

args = parser.parse_args(argv)

if args.input:
    with open(args.input, "r", encoding="utf-8") as f:
        data = f.read()
else:
    data = sys.stdin.read()

# Process data with args.format
```

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
