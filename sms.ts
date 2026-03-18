#!/usr/bin/env bun
/**
 * SMS (Script Management System)
 * Git-backed alias system for managing scripts
 */

import {
  parseEnvFlag,
  addCommand,
  initCommand,
  runCommand,
  rmCommand,
  updateCommand,
  envCommand,
  clearEnvCommand,
  showCommand,
  editCommand,
  listCommand,
  doctorCommand,
  llmCommand,
  completionCommand,
  showHelp,
} from "./src/commands";

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
          console.error("Usage: sms add <file> --alias <name> [--env \"K=V,FOO=BAR\"]");
          process.exit(1);
        }
        const aliasIdx = args.indexOf("--alias");
        const alias = aliasIdx > 0 ? args[aliasIdx + 1] : undefined;
        const envIdx = args.indexOf("--env");
        const envRaw = envIdx > 0 ? args[envIdx + 1] : undefined;
        const env = parseEnvFlag(envRaw);
        addCommand(filePath, alias, env);
        break;
      }

      case "run": {
        const dryRun = args.includes("--dry-run");
        const runArgs = args.slice(1).filter((arg) => arg !== "--dry-run");
        const alias = runArgs[0];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms run [--dry-run] <alias> [args...]");
          process.exit(1);
        }
        runCommand(alias, runArgs.slice(1), dryRun);
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
          console.error("Usage: sms update <alias> [--env \"K=V,FOO=BAR\"] [--clear-env]");
          process.exit(1);
        }
        const clearEnv = args.includes("--clear-env");
        const envIdx = args.indexOf("--env");
        const envRaw = envIdx > 0 ? args[envIdx + 1] : undefined;
        if (clearEnv && envIdx > 0) {
          console.error("Error: --env and --clear-env cannot be used together");
          process.exit(2);
        }
        if (clearEnv) {
          clearEnvCommand(alias);
          break;
        }
        const env = parseEnvFlag(envRaw);
        updateCommand(alias, env);
        break;
      }

      case "env": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms env <alias>");
          process.exit(1);
        }
        envCommand(alias);
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

      case "edit": {
        const alias = args[1];
        if (!alias) {
          console.error("Error: Missing alias");
          console.error("Usage: sms edit <alias>");
          process.exit(1);
        }
        editCommand(alias);
        break;
      }

      case "list":
        listCommand();
        break;

      case "doctor":
        doctorCommand();
        break;

      case "llm":
        llmCommand();
        break;

      case "init": {
        const name = args[1];
        const typeIdx = args.indexOf("--type");
        const typeRaw = typeIdx > 0 ? args[typeIdx + 1] : undefined;
        if (!name || !typeRaw) {
          console.error("Error: Missing name or --type");
          console.error("Usage: sms init <name> --type <python|ts> [--alias <name>] [--location <cwd|sms>] [--no-add] [--force]");
          process.exit(1);
        }
        if (typeRaw !== "python" && typeRaw !== "ts") {
          console.error("Error: Invalid --type (use python|ts)");
          process.exit(2);
        }
        const aliasIdx = args.indexOf("--alias");
        const alias = aliasIdx > 0 ? args[aliasIdx + 1] : undefined;
        const locationIdx = args.indexOf("--location");
        const locationRaw = locationIdx > 0 ? args[locationIdx + 1] : undefined;
        const location =
          locationRaw === "sms" ? "sms" : locationRaw === "cwd" || !locationRaw ? "cwd" : undefined;
        if (!location) {
          console.error("Error: Invalid --location (use cwd|sms)");
          process.exit(2);
        }
        const addToSms = !args.includes("--no-add");
        const force = args.includes("--force");
        initCommand(name, typeRaw, alias, location, addToSms, force);
        break;
      }

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
