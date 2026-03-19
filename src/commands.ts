#!/usr/bin/env bun
/**
 * SMS Command Implementations
 */

import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SCRIPTS_DIR } from "./config";
import {
  ensureSmsRepo,
  loadIndex,
  saveIndex,
  commitChanges,
  generateUniqueFileName,
  executeScript,
  getAliases,
} from "./utils";
import { resolveTemplateName, templateFor, writeTemplateFile } from "./templates";
import type { DoctorResult } from "./types";

export function parseEnvFlag(raw?: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  const env: Record<string, string> = {};
  const entries = raw.split(",");
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) {
      console.error(`Error: Invalid env entry '${trimmed}'. Use KEY=VALUE.`);
      process.exit(2);
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!key) {
      console.error(`Error: Invalid env entry '${trimmed}'. Use KEY=VALUE.`);
      process.exit(2);
    }
    env[key] = value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

export function addCommand(filePath: string, alias?: string, env?: Record<string, string>): void {
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
    env,
    addedAt: now,
    updatedAt: now,
  };
  saveIndex(index);

  commitChanges(`Add script '${targetAlias}' -> ${targetFileName}`);
  console.log(`Added '${targetAlias}' -> scripts/${targetFileName}`);
}

export function initCommand(
  name: string,
  type: "python" | "ts",
  alias?: string,
  location: "cwd" | "sms" = "cwd",
  addToSms: boolean = true,
  force: boolean = false
): void {
  const scriptName = resolveTemplateName(name, type);
  const template = templateFor(type, path.parse(scriptName).name);

  if (location === "sms") {
    ensureSmsRepo();
    const targetPath = path.join(SCRIPTS_DIR, scriptName);
    writeTemplateFile(targetPath, template, force);

    if (addToSms) {
      const index = loadIndex();
      const targetAlias = alias || path.parse(scriptName).name;
      if (index.scripts[targetAlias]) {
        console.error(`Error: Alias '${targetAlias}' already exists`);
        console.error(`Use 'sms rm ${targetAlias}' first to remove it`);
        process.exit(1);
      }
      const now = new Date().toISOString();
      index.scripts[targetAlias] = {
        path: scriptName,
        sourcePath: targetPath,
        addedAt: now,
        updatedAt: now,
      };
      saveIndex(index);
      commitChanges(`Init script '${targetAlias}'`);
      console.log(`Initialized '${targetAlias}' -> scripts/${scriptName}`);
    } else {
      console.log(`Created ${targetPath}`);
    }
    return;
  }

  const targetPath = path.resolve(scriptName);
  writeTemplateFile(targetPath, template, force);
  console.log(`Created ${targetPath}`);

  if (addToSms) {
    addCommand(targetPath, alias);
  }
}

export function runCommand(alias: string, args: string[], dryRun: boolean = false): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  executeScript(entry.path, args, entry.env, dryRun);
}

export function rmCommand(alias: string): void {
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

export function renameCommand(oldAlias: string, newAlias: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[oldAlias];

  if (!entry) {
    console.error(`Error: Unknown alias '${oldAlias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  if (index.scripts[newAlias]) {
    console.error(`Error: Alias '${newAlias}' already exists`);
    process.exit(1);
  }

  delete index.scripts[oldAlias];
  index.scripts[newAlias] = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  saveIndex(index);

  commitChanges(`Rename script '${oldAlias}' to '${newAlias}'`);
  console.log(`Renamed '${oldAlias}' -> '${newAlias}'`);
}

export function updateCommand(alias: string, env?: Record<string, string>, sourcePathOverride?: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  const sourcePath = sourcePathOverride ? path.resolve(sourcePathOverride) : entry.sourcePath;

  if (!sourcePath) {
    console.error(`Error: No source path recorded for '${alias}'`);
    console.error(`This script was added before update tracking was available.`);
    console.error(`To update: use 'sms update ${alias} --source <file>' or remove and re-add it from the new source.`);
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source file not found: ${sourcePath}`);
    console.error(`The original file may have been moved or deleted.`);
    process.exit(1);
  }

  const targetPath = path.join(SCRIPTS_DIR, entry.path);

  // Copy updated file
  fs.copyFileSync(sourcePath, targetPath);

  if (env) {
    entry.env = env;
  }

  entry.sourcePath = sourcePath;

  // Update timestamp
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  commitChanges(`Update script '${alias}' from ${sourcePath}`);
  console.log(`Updated '${alias}' from ${sourcePath}`);
}

export function envCommand(alias: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  const env = entry.env || {};
  const keys = Object.keys(env).sort();

  if (keys.length === 0) {
    console.log(`No env overrides set for '${alias}'`);
    return;
  }

  console.log(`Env overrides for '${alias}':`);
  for (const key of keys) {
    console.log(`${key}=${env[key]}`);
  }
}

export function clearEnvCommand(alias: string, sourcePathOverride?: string): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  const sourcePath = sourcePathOverride ? path.resolve(sourcePathOverride) : entry.sourcePath;

  if (!sourcePath) {
    console.error(`Error: No source path recorded for '${alias}'`);
    console.error(`This script was added before update tracking was available.`);
    console.error(`To clear env: use 'sms update ${alias} --clear-env --source <file>' or remove and re-add it without env overrides.`);
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source file not found: ${sourcePath}`);
    console.error(`The original file may have been moved or deleted.`);
    process.exit(1);
  }

  const targetPath = path.join(SCRIPTS_DIR, entry.path);
  fs.copyFileSync(sourcePath, targetPath);

  delete entry.env;
  entry.sourcePath = sourcePath;
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  commitChanges(`Clear env for script '${alias}'`);
  console.log(`Cleared env overrides for '${alias}'`);
}

export function showCommand(alias: string): void {
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

  if (entry.env && Object.keys(entry.env).length > 0) {
    console.log("# sms metadata:");
    console.log("# env:");
    for (const [key, value] of Object.entries(entry.env)) {
      console.log(`#   ${key}=${value}`);
    }
    console.log("");
  }

  const content = fs.readFileSync(scriptPath, "utf-8");
  console.log(content);
}

export function editCommand(alias: string): void {
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

  // Get file hash before editing
  const beforeHash = Bun.hash(fs.readFileSync(scriptPath));

  // Determine editor
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const shell = process.env.SHELL || "/bin/sh";
  const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

  // Open editor
  const child = spawn(shell, ["-lc", `${editor} ${shellQuote(scriptPath)}`], {
    stdio: "inherit",
    detached: false,
  });

  child.on("error", (error) => {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      console.error(`Error: Failed to start editor shell '${shell}'.`);
      process.exit(1);
    }
    console.error(`Error: Failed to start editor: ${error.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`Editor exited with code ${code}`);
      process.exit(code ?? 1);
    }

    // Check if file was modified
    const afterHash = Bun.hash(fs.readFileSync(scriptPath));
    if (beforeHash === afterHash) {
      console.log("No changes made");
      return;
    }

    // Update timestamp
    entry.updatedAt = new Date().toISOString();
    saveIndex(index);

    // Commit changes
    commitChanges(`Edit script '${alias}'`);
    console.log(`Updated '${alias}'`);
  });
}

export function listCommand(): void {
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

export function doctorCommand(): void {
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

export function llmCommand(): void {
  console.log(`SMS LLM Guide
=============

Use SMS to register scripts by alias and run them from anywhere.

Core commands:
  sms add <file> --alias <name> [--env "K=V,FOO=BAR"]
  sms run [--dry-run] <alias> [args...]
  sms rename <old> <new>
  sms update <alias> [--env "K=V,FOO=BAR"] [--clear-env] [--source <file>]
  sms env <alias>
  sms show <alias>
  sms rm <alias>
  sms list
  sms doctor
  sms init <name> --type <python|ts> [--alias <name>] [--location <cwd|sms>] [--no-add] [--force]

Runtime behavior:
  - Python scripts run with: uv run <script>
  - TypeScript scripts run with: bun <script>
  - Arguments after alias are passed through unchanged.
  - --dry-run prints the resolved command and env overrides without executing.

Script authoring guidance:
  - Prefer Python or TypeScript only.
  - Include clear CLI args and --help output.
  - Return exit code 2 for argument/usage errors.
  - For Python, prefer PEP 723 metadata headers for dependencies.

Examples:
  sms init etl --type python --alias etl
  sms run --dry-run etl --input data.csv
  sms run etl --input data.csv
  sms rename etl etl-prod
  sms update etl
  sms update etl --source ~/work/new-etl.py
  sms update etl --clear-env --source ~/work/new-etl.py
  sms env etl`);
}

export function completionCommand(shell?: string): void {
  const scriptName = "sms";
  const homeDir = process.env.HOME;

  // Zsh completion
  const zshCompletion = [
    `#compdef ${scriptName}`,
    ``,
    `_${scriptName}() {`,
    `  local curcontext="$curcontext" state line`,
    `  typeset -A opt_args`,
    ``,
    `  _arguments -C \\`,
    `    '1: :->_commands' \\`,
    `    '*:: :->args'`,
    ``,
    `  case "\$state" in`,
    `    _commands)`,
    `      local commands=(`,
    `        'add:Add a script with an alias'`,
    `        'run:Run a script by alias'`,
    `        'rename:Rename a script alias'`,
    `        'rm:Remove a script'`,
    `        'update:Update a script from source'`,
    `        'env:Show script env overrides'`,
    `        'show:Show script contents'`,
    `        'edit:Edit a script in $EDITOR'`,
    `        'list:List all scripts'`,
    `        'doctor:Check for broken paths'`,
    `        'llm:Show LLM usage guide'`,
    `        'init:Create a script template'`,
    `        'help:Show help'`,
    `        'completion:Generate shell completion'`,
    `      )`,
    `      _describe -t commands 'commands' commands`,
    `      ;;`,
    `    args)`,
    `      case "\$line[1]" in`,
    `        run|rename|rm|update|env|show|edit)`,
    `          local aliases=($(${scriptName} completion --aliases 2>/dev/null || echo ""))`,
    `          _describe -t aliases 'aliases' aliases`,
    `          ;;`,
    `        add)`,
    `          if [ \$#line -eq 1 ]; then`,
    `            _files`,
    `          else`,
    `            _arguments '--alias[Alias name]:alias:'`,
    `          fi`,
    `          ;;`,
    `        init)`,
    `          _arguments '--type[Template type]:type:(python ts)'`,
    `          ;;`,
    `      esac`,
    `      ;;`,
    `  esac`,
    `}`,
    ``,
    `_${scriptName}`
  ].join("\n");

  // Fish completion
  const fishCompletion = [
    `complete -c ${scriptName} -f`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'add' -d 'Add a script with an alias'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'run' -d 'Run a script by alias'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'rename' -d 'Rename a script alias'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'rm' -d 'Remove a script'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'update' -d 'Update a script from source'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'env' -d 'Show script env overrides'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'show' -d 'Show script contents'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'edit' -d 'Edit a script in $EDITOR'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'list' -d 'List all scripts'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'doctor' -d 'Check for broken paths'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'llm' -d 'Show LLM usage guide'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'init' -d 'Create a script template'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'help' -d 'Show help'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion'`,
    ``,
    `complete -c ${scriptName} -n '__fish_seen_subcommand_from run rename rm update env show edit' -a "(${scriptName} completion --aliases 2>/dev/null)"`,
    `complete -c ${scriptName} -n '__fish_seen_subcommand_from add; and __fish_is_token_n 3' -F`
  ].join("\n");

  const installCompletion = (targetShell: "zsh" | "fish"): void => {
    if (!homeDir) {
      console.error("Error: HOME is not set");
      process.exit(1);
    }

    if (targetShell === "zsh") {
      const completionsDir = path.join(homeDir, ".zsh", "completions");
      const completionPath = path.join(completionsDir, "_sms");
      const zshrcPath = path.join(homeDir, ".zshrc");
      const zshrcSnippet = [
        "fpath=(~/.zsh/completions $fpath)",
        "autoload -Uz compinit",
        "compinit",
      ].join("\n");

      fs.mkdirSync(completionsDir, { recursive: true });
      fs.writeFileSync(completionPath, zshCompletion + "\n", "utf-8");

      const existingZshrc = fs.existsSync(zshrcPath)
        ? fs.readFileSync(zshrcPath, "utf-8")
        : "";
      if (!existingZshrc.includes("fpath=(~/.zsh/completions $fpath)")) {
        const nextZshrc = existingZshrc.trimEnd();
        const prefix = nextZshrc.length > 0 ? `${nextZshrc}\n\n` : "";
        fs.writeFileSync(zshrcPath, `${prefix}${zshrcSnippet}\n`, "utf-8");
      }

      console.log(`Installed zsh completion to ${completionPath}`);
      console.log(`Restart your shell or run: source ${zshrcPath}`);
      return;
    }

    const fishDir = path.join(homeDir, ".config", "fish", "completions");
    const fishPath = path.join(fishDir, "sms.fish");
    fs.mkdirSync(fishDir, { recursive: true });
    fs.writeFileSync(fishPath, fishCompletion + "\n", "utf-8");
    console.log(`Installed fish completion to ${fishPath}`);
  };

  if (shell === "--aliases") {
    // Output just the aliases (for internal use by completion scripts)
    ensureSmsRepo();
    const aliases = getAliases();
    console.log(aliases.join(" "));
  } else if (shell === "install") {
    const targetShell = process.argv[4];
    if (targetShell === "zsh" || targetShell === "fish") {
      installCompletion(targetShell);
    } else {
      console.error("Usage: sms completion install <zsh|fish>");
      process.exit(1);
    }
  } else if (shell === "zsh") {
    console.log(zshCompletion);
  } else if (shell === "fish") {
    console.log(fishCompletion);
  } else {
    // Default: show all with instructions
    console.log(`Shell Completion Setup
======================

Zsh:
----
1. Install automatically:
   sms completion install zsh

2. Manual install:
   mkdir -p ~/.zsh/completions
   sms completion zsh > ~/.zsh/completions/_sms

3. Add to ~/.zshrc:
   fpath=(~/.zsh/completions $fpath)
   autoload -Uz compinit
   compinit

Fish:
-----
1. Install automatically:
   sms completion install fish

2. Manual install:
   sms completion fish > ~/.config/fish/completions/sms.fish

Available shells: zsh, fish
Usage: sms completion <shell>
       sms completion install <shell>`);
  }
}

export function showHelp(): void {
  console.log(`SMS (Script Management System)

Usage:
  sms add <file> --alias <name> [--env "K=V,FOO=BAR"]   Add a script with an alias
  sms run [--dry-run] <alias> [args...]      Run a script by alias
  sms rename <old> <new>           Rename a script alias
  sms rm <alias>                   Remove a script
  sms update <alias> [--env "K=V,FOO=BAR"] [--clear-env] [--source <file>]  Update script from original source or replace source path
  sms env <alias>                  Show env overrides for a script
  sms show <alias>                 Show script contents
  sms edit <alias>                 Edit a script in $EDITOR
  sms list                         List all scripts
  sms doctor                       Check for broken paths
  sms llm                          Show LLM usage guide for SMS
  sms init <name> --type <python|ts> [--alias <name>] [--location <cwd|sms>] [--no-add] [--force]
  sms completion <shell>           Generate shell completion (zsh/fish)
  sms completion install <shell>   Install shell completion (zsh/fish)
  sms help                         Show this help

Setup Autocomplete:
  sms completion install zsh

Examples:
  sms add ./myscript.py --alias etl
  sms run etl --input data.csv
  sms run --dry-run etl --input data.csv
  sms rename etl etl-prod
  sms show etl
  sms rm etl
  sms update etl
  sms update etl --source ~/work/new-etl.py
  sms update etl --clear-env --source ~/work/new-etl.py
  sms env etl
  sms completion install zsh
  sms init myscript --type python --alias etl
`);
}
