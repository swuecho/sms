#!/usr/bin/env bun
/**
 * SMS (Script Management System)
 * Git-backed alias system for managing scripts
 */

import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { Index, ScriptEntry, DoctorResult } from "./types";

const SMS_DIR = path.join(process.env.HOME || "~", ".sms");
const SCRIPTS_DIR = path.join(SMS_DIR, "scripts");
const INDEX_PATH = path.join(SMS_DIR, "index.json");

// Utility functions
function ensureSmsRepo(): void {
  if (!fs.existsSync(SMS_DIR)) {
    fs.mkdirSync(SMS_DIR, { recursive: true });
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

    // Initialize git repo
    git("init");
    git("config", "user.email", "sms@localhost");
    git("config", "user.name", "SMS");

    // Create initial index
    saveIndex({ version: "1.0.0", scripts: {} });

    git("add", ".");
    git("commit", "-m", "Initial SMS setup");
    console.log(`Initialized SMS repository at ${SMS_DIR}`);
  }
}

function loadIndex(): Index {
  if (!fs.existsSync(INDEX_PATH)) {
    return { version: "1.0.0", scripts: {} };
  }
  const content = fs.readFileSync(INDEX_PATH, "utf-8");
  return JSON.parse(content);
}

function saveIndex(index: Index): void {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
}

function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: SMS_DIR, stdio: "pipe" });
  if (result.status !== 0 && result.stderr) {
    const error = result.stderr.toString();
    if (!error.includes("nothing to commit")) {
      throw new Error(`Git error: ${error}`);
    }
  }
}

function commitChanges(message: string): void {
  try {
    git("add", ".");
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: SMS_DIR, encoding: "utf-8" });
    if (status.stdout?.trim()) {
      git("commit", "-m", message);
    }
  } catch (e) {
    // Ignore empty commits
  }
}

function getScriptType(filePath: string): "bash" | "python" | "bun" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".sh" || ext === ".bash") return "bash";
  if (ext === ".ts") return "bun";

  // Check shebang
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const firstLine = content.split("\n")[0] || "";
    if (firstLine.includes("python")) return "python";
    if (firstLine.includes("bash") || firstLine.includes("/sh")) return "bash";
    if (firstLine.includes("bun")) return "bun";
  } catch {
    // ignore
  }
  return "unknown";
}

function executeScript(scriptPath: string, args: string[]): void {
  const type = getScriptType(scriptPath);
  const fullPath = path.join(SMS_DIR, "scripts", scriptPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Script not found at ${fullPath}`);
    process.exit(1);
  }

  // Make executable
  try {
    fs.chmodSync(fullPath, 0o755);
  } catch {
    // ignore
  }

  let command: string;
  if (type === "python") {
    command = `python3 "${fullPath}"`;
  } else if (type === "bash") {
    command = `bash "${fullPath}"`;
  } else if (type === "bun") {
    command = `bun "${fullPath}"`;
  } else {
    command = `"${fullPath}"`;
  }

  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

// Generate unique filename with path encoding and timestamp
function generateUniqueFileName(originalPath: string, fileName: string): string {
  const { name, ext } = path.parse(fileName);
  const parentDir = path.basename(path.dirname(originalPath));

  // Create a short hash of the full path for uniqueness
  const pathHash = Bun.hash(originalPath).toString(36).slice(0, 6);

  // Format: {parent_dir}_{name}_{path_hash}{ext}
  // Example: proj1_deploy_a3f7b2.ts
  let targetFileName = `${parentDir}_${name}_${pathHash}${ext}`;

  // Sanitize filename: replace special chars
  targetFileName = targetFileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Handle collision (very unlikely with hash, but just in case)
  let counter = 1;
  let finalFileName = targetFileName;
  while (fs.existsSync(path.join(SCRIPTS_DIR, finalFileName))) {
    const { name: n, ext: e } = path.parse(targetFileName);
    finalFileName = `${n}_${counter}${e}`;
    counter++;
  }

  return finalFileName;
}

// Commands
function addCommand(filePath: string, alias?: string): void {
  ensureSmsRepo();

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);
  const targetAlias = alias || path.parse(fileName).name;

  // Check if alias already exists
  const index = loadIndex();
  if (index.scripts[targetAlias]) {
    console.error(`Error: Alias '${targetAlias}' already exists`);
    console.error(`Use 'sms rm ${targetAlias}' first to remove it`);
    process.exit(1);
  }

  // Generate unique filename with path encoding for traceability
  const targetFileName = generateUniqueFileName(resolvedPath, fileName);
  const targetPath = path.join(SCRIPTS_DIR, targetFileName);

  // Copy to scripts directory
  fs.copyFileSync(resolvedPath, targetPath);

  // Update index
  const now = new Date().toISOString();
  index.scripts[targetAlias] = {
    path: targetFileName,
    sourcePath: resolvedPath,
    addedAt: now,
    updatedAt: now,
  };
  saveIndex(index);

  commitChanges(`Add script '${targetAlias}' -> ${targetFileName}`);
  console.log(`Added '${targetAlias}' -> scripts/${targetFileName}`);
}

function runCommand(alias: string, args: string[]): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  executeScript(entry.path, args);
}

function mvCommand(alias: string, newFolder: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    process.exit(1);
  }

  // Normalize folder path
  let folder = newFolder;
  if (!folder.endsWith("/")) folder += "/";
  if (folder.startsWith("/")) folder = folder.slice(1);

  // Create subdirectories
  const targetDir = path.join(SCRIPTS_DIR, folder);
  fs.mkdirSync(targetDir, { recursive: true });

  // Move file
  const oldPath = path.join(SCRIPTS_DIR, entry.path);
  const fileName = path.basename(entry.path);
  const newRelativePath = path.join(folder, fileName);
  const newPath = path.join(SCRIPTS_DIR, newRelativePath);

  fs.renameSync(oldPath, newPath);

  // Update index
  entry.path = newRelativePath;
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  commitChanges(`Move '${alias}' to ${folder}`);
  console.log(`Moved '${alias}' -> scripts/${newRelativePath}`);
}

function rmCommand(alias: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    process.exit(1);
  }

  // Remove file
  const filePath = path.join(SCRIPTS_DIR, entry.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Update index
  delete index.scripts[alias];
  saveIndex(index);

  commitChanges(`Remove script '${alias}'`);
  console.log(`Removed '${alias}'`);
}

function updateCommand(alias: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  if (!entry.sourcePath) {
    console.error(`Error: No source path recorded for '${alias}'`);
    console.error(`This script was added before update tracking was available.`);
    console.error(`To update: remove the script and re-add it from the new source.`);
    process.exit(1);
  }

  if (!fs.existsSync(entry.sourcePath)) {
    console.error(`Error: Source file not found: ${entry.sourcePath}`);
    console.error(`The original file may have been moved or deleted.`);
    process.exit(1);
  }

  const targetPath = path.join(SCRIPTS_DIR, entry.path);

  // Copy updated file
  fs.copyFileSync(entry.sourcePath, targetPath);

  // Update timestamp
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  commitChanges(`Update script '${alias}' from ${entry.sourcePath}`);
  console.log(`Updated '${alias}' from ${entry.sourcePath}`);
}

function showCommand(alias: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  const scriptPath = path.join(SCRIPTS_DIR, entry.path);

  if (!fs.existsSync(scriptPath)) {
    console.error(`Error: Script file not found: ${entry.path}`);
    console.error(`Run 'sms doctor' to check for issues`);
    process.exit(1);
  }

  const content = fs.readFileSync(scriptPath, "utf-8");
  console.log(content);
}

function listCommand(): void {
  ensureSmsRepo();

  const index = loadIndex();
  const aliases = Object.keys(index.scripts).sort();

  if (aliases.length === 0) {
    console.log("No scripts registered. Use 'sms add <file> --alias <name>'");
    return;
  }

  console.log("Available scripts:");
  console.log("");

  const maxAliasLen = Math.max(...aliases.map((a) => a.length));

  for (const alias of aliases) {
    const entry = index.scripts[alias];
    const fullPath = path.join("scripts", entry.path);
    const paddedAlias = alias.padEnd(maxAliasLen);
    console.log(`  ${paddedAlias}  →  ${fullPath}`);
  }
}

function doctorCommand(): void {
  ensureSmsRepo();

  const index = loadIndex();
  const issues: DoctorResult[] = [];

  for (const [alias, entry] of Object.entries(index.scripts)) {
    const fullPath = path.join(SCRIPTS_DIR, entry.path);
    const exists = fs.existsSync(fullPath);

    if (!exists) {
      issues.push({
        alias,
        path: entry.path,
        exists: false,
        suggestedFix: `sms rm ${alias}  # or restore the file`,
      });
    }
  }

  // Check for orphaned files in scripts directory
  function scanDir(dir: string, relativePath: string = ""): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relPath = path.join(relativePath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...scanDir(fullPath, relPath));
      } else {
        // Check if this file is tracked
        const isTracked = Object.values(index.scripts).some(
          (s) => s.path === relPath
        );
        if (!isTracked) {
          results.push(relPath);
        }
      }
    }

    return results;
  }

  const orphaned = scanDir(SCRIPTS_DIR);

  if (issues.length === 0 && orphaned.length === 0) {
    console.log("✓ All scripts are healthy");
    return;
  }

  if (issues.length > 0) {
    console.log("Broken aliases (file missing):");
    for (const issue of issues) {
      console.log(`  ✗ ${issue.alias}: ${issue.path}`);
      console.log(`    Fix: ${issue.suggestedFix}`);
    }
    console.log("");
  }

  if (orphaned.length > 0) {
    console.log("Orphaned files (not in index):");
    for (const file of orphaned) {
      console.log(`  ? scripts/${file}`);
    }
    console.log("");
    console.log("To register: sms add ~/.sms/scripts/<file> --alias <name>");
  }
}

function getAliases(): string[] {
  const index = loadIndex();
  return Object.keys(index.scripts).sort();
}

function completionCommand(shell?: string): void {
  const scriptName = "sms";

  // Bash completion
  const bashCompletion = `_${scriptName}_complete() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  # Main commands
  local commands="add run mv rm update show list doctor help completion"

  # Complete based on position
  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
    return 0
  fi

  # Complete subcommand arguments
  local cmd="\${COMP_WORDS[1]}"

  case "\${cmd}" in
    run|rm|update|show)
      # Complete with aliases
      local aliases=$(${scriptName} completion --aliases 2>/dev/null || echo "")
      COMPREPLY=( $(compgen -W "\${aliases}" -- \${cur}) )
      ;;
    mv)
      if [ $COMP_CWORD -eq 2 ]; then
        # First arg: alias
        local aliases=$(${scriptName} completion --aliases 2>/dev/null || echo "")
        COMPREPLY=( $(compgen -W "\${aliases}" -- \${cur}) )
      else
        # Second arg: directory (use standard directory completion)
        COMPREPLY=( $(compgen -d -- \${cur}) )
      fi
      ;;
    add)
      if [ $COMP_CWORD -eq 2 ]; then
        # File completion
        COMPREPLY=( $(compgen -f -- \${cur}) )
      elif [ "\${prev}" == "--alias" ]; then
        # No completion for alias name
        COMPREPLY=()
      fi
      ;;
    *)
      COMPREPLY=()
      ;;
  esac
}
complete -F _${scriptName}_complete ${scriptName}`;

  // Zsh completion
  const zshCompletion = `#compdef ${scriptName}

_${scriptName}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \\
    '1: :->_commands' \\
    '*:: :->args'

  case "\$state" in
    _commands)
      local commands=(
        'add:Add a script with an alias'
        'run:Run a script by alias'
        'mv:Move script to subfolder'
        'rm:Remove a script'
        'update:Update a script from source'
        'show:Show script contents'
        'list:List all scripts'
        'doctor:Check for broken paths'
        'help:Show help'
        'completion:Generate shell completion'
      )
      _describe -t commands 'commands' commands
      ;;
    args)
      case "\$line[1]" in
        run|rm|update|show)
          local aliases=($(${scriptName} completion --aliases 2>/dev/null || echo ""))
          _describe -t aliases 'aliases' aliases
          ;;
        mv)
          if [ \$#line -eq 1 ]; then
            local aliases=($(${scriptName} completion --aliases 2>/dev/null || echo ""))
            _describe -t aliases 'aliases' aliases
          else
            _path -/
          fi
          ;;
        add)
          if [ \$#line -eq 1 ]; then
            _files
          else
            _arguments '--alias[Alias name]:alias:'
          fi
          ;;
      esac
      ;;
  esac
}

_${scriptName}`;

  // Fish completion
  const fishCompletion = `complete -c ${scriptName} -f
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'add' -d 'Add a script with an alias'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'run' -d 'Run a script by alias'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'mv' -d 'Move script to subfolder'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'rm' -d 'Remove a script'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'update' -d 'Update a script from source'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'show' -d 'Show script contents'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'list' -d 'List all scripts'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'doctor' -d 'Check for broken paths'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'help' -d 'Show help'
complete -c ${scriptName} -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion'

complete -c ${scriptName} -n '__fish_seen_subcommand_from run rm update show' -a "(${scriptName} completion --aliases 2>/dev/null)"
complete -c ${scriptName} -n '__fish_seen_subcommand_from mv; and __fish_is_token_n 3' -a "(${scriptName} completion --aliases 2>/dev/null)"
complete -c ${scriptName} -n '__fish_seen_subcommand_from add; and __fish_is_token_n 3' -F`;

  if (shell === "--aliases") {
    // Output just the aliases (for internal use by completion scripts)
    ensureSmsRepo();
    const aliases = getAliases();
    console.log(aliases.join(" "));
  } else if (shell === "bash") {
    console.log(bashCompletion);
  } else if (shell === "zsh") {
    console.log(zshCompletion);
  } else if (shell === "fish") {
    console.log(fishCompletion);
  } else {
    // Default: show all with instructions
    console.log(`Shell Completion Setup
======================

Bash:
-----
1. Add to ~/.bashrc:
   eval "$(sms completion bash)"

2. Or save to a file:
   sms completion bash > /etc/bash_completion.d/sms

Zsh:
----
1. Add to ~/.zshrc:
   eval "$(sms completion zsh)"

2. Or save to a directory in $fpath:
   sms completion zsh > /usr/local/share/zsh/site-functions/_sms

Fish:
-----
1. Save to fish completions:
   sms completion fish > ~/.config/fish/completions/sms.fish

Available shells: bash, zsh, fish
Usage: sms completion <shell>`);
  }
}

function showHelp(): void {
  console.log(`SMS (Script Management System)

Usage:
  sms add <file> --alias <name>    Add a script with an alias
  sms run <alias> [args...]         Run a script by alias
  sms mv <alias> <folder>/          Move script to subfolder
  sms rm <alias>                   Remove a script
  sms update <alias>               Update script from original source
  sms show <alias>                 Show script contents
  sms list                         List all scripts
  sms doctor                       Check for broken paths
  sms completion <shell>           Generate shell completion (bash/zsh/fish)
  sms help                         Show this help

Setup Autocomplete:
  eval "$(sms completion bash)"     # Add to ~/.bashrc
  eval "$(sms completion zsh)"      # Add to ~/.zshrc

Examples:
  sms add ./myscript.py --alias etl
  sms run etl --input data.csv
  sms show etl
  sms mv etl utils/
  sms rm etl
  sms update etl
`);
}

// Main CLI
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case "add": {
        const filePath = args[1];
        if (!filePath) {
          console.error("Error: Missing file path");
          console.error("Usage: sms add <file> --alias <name>");
          process.exit(1);
        }
        const aliasIdx = args.indexOf("--alias");
        const alias = aliasIdx > 0 ? args[aliasIdx + 1] : undefined;
        addCommand(filePath, alias);
        break;
      }

      case "run": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms run <alias> [args...]");
          process.exit(1);
        }
        runCommand(alias, args.slice(2));
        break;
      }

      case "mv": {
        const alias = args[1];
        const newFolder = args[2];
        if (!alias || !newFolder) {
          console.error("Error: Missing arguments");
          console.error("Usage: sms mv <alias> <folder>/");
          process.exit(1);
        }
        mvCommand(alias, newFolder);
        break;
      }

      case "rm": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms rm <alias>");
          process.exit(1);
        }
        rmCommand(alias);
        break;
      }

      case "update": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms update <alias>");
          process.exit(1);
        }
        updateCommand(alias);
        break;
      }

      case "show": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms show <alias>");
          process.exit(1);
        }
        showCommand(alias);
        break;
      }

      case "list":
        listCommand();
        break;

      case "doctor":
        doctorCommand();
        break;

      case "completion":
        completionCommand(args[1]);
        break;

      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        console.error("Run 'sms help' for usage");
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

main();
