import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const repoRoot = "/Users/hwu/dev/sms";
const tempDirs: string[] = [];

function runSms(args: string[], homeDir: string) {
  return Bun.spawnSync({
    cmd: ["bun", "sms.ts", ...args],
    cwd: repoRoot,
    env: { ...process.env, HOME: homeDir },
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

describe("rename command", () => {
  test("renames an alias and preserves metadata", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const scriptPath = join(homeDir, "demo.py");
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

    const add = runSms(["add", scriptPath, "--alias", "demo", "--env", "FOO=bar"], homeDir);
    expect(add.exitCode).toBe(0);

    const indexPath = join(homeDir, ".sms", "index.json");
    const beforeIndex = JSON.parse(readFileSync(indexPath, "utf-8"));
    const beforeEntry = beforeIndex.scripts.demo;

    const rename = runSms(["rename", "demo", "demo-prod"], homeDir);
    expect(rename.exitCode).toBe(0);
    expect(decode(rename.stdout)).toContain("Renamed 'demo' -> 'demo-prod'");

    const afterIndex = JSON.parse(readFileSync(indexPath, "utf-8"));
    expect(afterIndex.scripts.demo).toBeUndefined();
    expect(afterIndex.scripts["demo-prod"].path).toBe(beforeEntry.path);
    expect(afterIndex.scripts["demo-prod"].sourcePath).toBe(beforeEntry.sourcePath);
    expect(afterIndex.scripts["demo-prod"].env).toEqual(beforeEntry.env);

    const envOut = runSms(["env", "demo-prod"], homeDir);
    expect(envOut.exitCode).toBe(0);
    expect(decode(envOut.stdout)).toContain("FOO=bar");
  });

  test("fails when target alias already exists", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const firstScript = join(homeDir, "first.py");
    const secondScript = join(homeDir, "second.py");
    writeFileSync(firstScript, "print('first')\n", "utf-8");
    writeFileSync(secondScript, "print('second')\n", "utf-8");

    expect(runSms(["add", firstScript, "--alias", "one"], homeDir).exitCode).toBe(0);
    expect(runSms(["add", secondScript, "--alias", "two"], homeDir).exitCode).toBe(0);

    const rename = runSms(["rename", "one", "two"], homeDir);
    expect(rename.exitCode).toBe(1);
    expect(decode(rename.stderr)).toContain("Alias 'two' already exists");
  });
});
