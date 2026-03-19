import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const repoRoot = "/Users/hwu/dev/sms";
const tempDirs: string[] = [];

function runSms(args: string[], homeDir: string, extraEnv: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: [process.execPath, "sms.ts", ...args],
    cwd: repoRoot,
    env: { ...process.env, HOME: homeDir, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function decode(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim();
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("robustness", () => {
  test("runs extensionless scripts when shebang indicates python", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const scriptPath = join(homeDir, "demo");
    writeFileSync(
      scriptPath,
      [
        "#!/usr/bin/env -S uv run --script",
        "# /// script",
        '# requires-python = ">=3.11"',
        "# dependencies = []",
        "# ///",
        "print('ok')",
        "",
      ].join("\n"),
      "utf-8"
    );

    expect(runSms(["add", scriptPath, "--alias", "demo"], homeDir).exitCode).toBe(0);

    const result = runSms(["run", "--dry-run", "demo"], homeDir);
    expect(result.exitCode).toBe(0);
    expect(decode(result.stdout)).toContain("Command: uv run");
  });

  test("repairs missing repo internals when ~/.sms already exists", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    mkdirSync(join(homeDir, ".sms"), { recursive: true });

    const result = runSms(["doctor"], homeDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(homeDir, ".sms", "scripts"))).toBe(true);
    expect(existsSync(join(homeDir, ".sms", "index.json"))).toBe(true);
    expect(decode(result.stdout)).toContain("All scripts are healthy");
  });

  test("reports a clear error when uv is missing", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const scriptPath = join(homeDir, "demo.py");
    writeFileSync(scriptPath, "print('ok')\n", "utf-8");

    expect(runSms(["add", scriptPath, "--alias", "demo"], homeDir).exitCode).toBe(0);

    const result = runSms(["run", "demo"], homeDir, { PATH: "/nonexistent" });
    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain("Failed to start 'uv'");
  });

  test("supports EDITOR commands with arguments", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const scriptPath = join(homeDir, "demo.py");
    writeFileSync(scriptPath, "print('ok')\n", "utf-8");

    expect(runSms(["add", scriptPath, "--alias", "demo"], homeDir).exitCode).toBe(0);

    const result = runSms(["edit", "demo"], homeDir, {
      EDITOR: `${process.execPath} -e "require('fs').writeFileSync(process.argv[1], \\"print('edited')\\\\n\\")"`,
    });
    expect(result.exitCode).toBe(0);
    expect(decode(result.stdout)).toContain("Updated 'demo'");

    const index = JSON.parse(readFileSync(join(homeDir, ".sms", "index.json"), "utf-8"));
    const storedScript = readFileSync(join(homeDir, ".sms", "scripts", index.scripts.demo.path), "utf-8");
    expect(storedScript).toContain("edited");
  });
});
