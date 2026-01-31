#!/usr/bin/env bun
/**
 * SMS Utility Functions
 */

import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SMS_DIR, SCRIPTS_DIR, INDEX_PATH } from "./config";
import type { Index } from "./types";

export function ensureSmsRepo(): void {
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

export function loadIndex(): Index {
  if (!fs.existsSync(INDEX_PATH)) {
    return { version: "1.0.0", scripts: {} };
  }
  const content = fs.readFileSync(INDEX_PATH, "utf-8");
  return JSON.parse(content);
}

export function saveIndex(index: Index): void {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
}

export function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: SMS_DIR, stdio: "pipe" });
  if (result.status !== 0 && result.stderr) {
    const error = result.stderr.toString();
    if (!error.includes("nothing to commit")) {
      throw new Error(`Git error: ${error}`);
    }
  }
}

export function commitChanges(message: string): void {
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

export function getScriptType(filePath: string): "bash" | "python" | "bun" | "unknown" {
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

export function executeScript(
  scriptPath: string,
  args: string[],
  env?: Record<string, string>
): void {
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
    env: { ...process.env, ...(env || {}) },
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

// Generate unique filename with path encoding and timestamp
export function generateUniqueFileName(originalPath: string, fileName: string): string {
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

export function getAliases(): string[] {
  const index = loadIndex();
  return Object.keys(index.scripts).sort();
}