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
  type: "bash" | "python" | "ts",
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

export function runCommand(alias: string, args: string[]): void {
  ensureSmsRepo();

  const index = loadIndex();
  const entry = index.scripts[alias];

  if (!entry) {
    console.error(`Error: Unknown alias '${alias}'`);
    console.error(`Run 'sms list' to see available scripts`);
    process.exit(1);
  }

  executeScript(entry.path, args, entry.env);
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

export function updateCommand(alias: string, env?: Record<string, string>): void {
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

  if (env) {
    entry.env = env;
  }

  // Update timestamp
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  commitChanges(`Update script '${alias}' from ${entry.sourcePath}`);
  console.log(`Updated '${alias}' from ${entry.sourcePath}`);
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

  // Open editor
  const child = spawn(editor, [scriptPath], {
    stdio: "inherit",
    detached: false,
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

export function completionCommand(shell?: string): void {
  const scriptName = "sms";

  // Bash completion
  const bashCompletion = [
    `_${scriptName}_complete() {`,
    `  local cur prev opts`,
    `  COMPREPLY=()`,
    `  cur="\${COMP_WORDS[COMP_CWORD]}"`,
    `  prev="\${COMP_WORDS[COMP_CWORD-1]}"`,
    ``,
    `  # Main commands`,
    `  local commands="add run rm update show edit list doctor init help completion"`,
    ``,
    `  # Complete based on position`,
    `  if [ $COMP_CWORD -eq 1 ]; then`,
    `    COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )`,
    `    return 0`,
    `  fi`,
    ``,
    `  # Complete subcommand arguments`,
    `  local cmd="\${COMP_WORDS[1]}"`,
    ``,
    `  case "\${cmd}" in`,
    `    run|rm|update|show|edit)`,
    `      # Complete with aliases`,
    `      local aliases=$(${scriptName} completion --aliases 2>/dev/null || echo "")`,
    `      COMPREPLY=( $(compgen -W "\${aliases}" -- \${cur}) )`,
    `      ;;`,
    `    add)`,
    `      if [ $COMP_CWORD -eq 2 ]; then`,
    `        # File completion`,
    `        COMPREPLY=( $(compgen -f -- \${cur}) )`,
    `      elif [ "\${prev}" == "--alias" ]; then`,
    `        # No completion for alias name`,
    `        COMPREPLY=()`,
    `      fi`,
    `      ;;`,
    `    init)`,
    `      if [ "\${prev}" == "--type" ]; then`,
    `        COMPREPLY=( $(compgen -W "bash python ts" -- \${cur}) )`,
    `      fi`,
    `      ;;`,
    `    *)`,
    `      COMPREPLY=()`,
    `      ;;`,
    `  esac`,
    `}`,
    `complete -F _${scriptName}_complete ${scriptName}`
  ].join("\n");

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
    `        'rm:Remove a script'`,
    `        'update:Update a script from source'`,
    `        'show:Show script contents'`,
    `        'edit:Edit a script in $EDITOR'`,
    `        'list:List all scripts'`,
    `        'doctor:Check for broken paths'`,
    `        'init:Create a script template'`,
    `        'help:Show help'`,
    `        'completion:Generate shell completion'`,
    `      )`,
    `      _describe -t commands 'commands' commands`,
    `      ;;`,
    `    args)`,
    `      case "\$line[1]" in`,
    `        run|rm|update|show|edit)`,
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
    `          _arguments '--type[Template type]:type:(bash python ts)'`,
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
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'rm' -d 'Remove a script'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'update' -d 'Update a script from source'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'show' -d 'Show script contents'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'edit' -d 'Edit a script in $EDITOR'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'list' -d 'List all scripts'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'doctor' -d 'Check for broken paths'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'init' -d 'Create a script template'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'help' -d 'Show help'`,
    `complete -c ${scriptName} -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion'`,
    ``,
    `complete -c ${scriptName} -n '__fish_seen_subcommand_from run rm update show edit' -a "(${scriptName} completion --aliases 2>/dev/null)"`,
    `complete -c ${scriptName} -n '__fish_seen_subcommand_from add; and __fish_is_token_n 3' -F`
  ].join("\n");

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

export function showHelp(): void {
  console.log(`SMS (Script Management System)

Usage:
  sms add <file> --alias <name> [--env "K=V,FOO=BAR"]   Add a script with an alias
  sms run <alias> [args...]        Run a script by alias
  sms rm <alias>                   Remove a script
  sms update <alias> [--env "K=V,FOO=BAR"]              Update script from original source
  sms show <alias>                 Show script contents
  sms edit <alias>                 Edit a script in $EDITOR
  sms list                         List all scripts
  sms doctor                       Check for broken paths
  sms init <name> --type <bash|python|ts> [--alias <name>] [--location <cwd|sms>] [--no-add] [--force]
  sms completion <shell>           Generate shell completion (bash/zsh/fish)
  sms help                         Show this help

Setup Autocomplete:
  eval "$(sms completion bash)"     # Add to ~/.bashrc
  eval "$(sms completion zsh)"      # Add to ~/.zshrc

Examples:
  sms add ./myscript.py --alias etl
  sms run etl --input data.csv
  sms show etl
  sms rm etl
  sms update etl
  sms init myscript --type python --alias etl
`);
}