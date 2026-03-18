import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
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

describe("env management", () => {
  test("shows and clears env overrides for a script", () => {
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

    const add = runSms(["add", scriptPath, "--alias", "demo", "--env", "FOO=bar,BAR=baz"], homeDir);
    expect(add.exitCode).toBe(0);

    const envBefore = runSms(["env", "demo"], homeDir);
    expect(envBefore.exitCode).toBe(0);
    expect(decode(envBefore.stdout)).toContain("Env overrides for 'demo':");
    expect(decode(envBefore.stdout)).toContain("BAR=baz");
    expect(decode(envBefore.stdout)).toContain("FOO=bar");

    const dryRunBefore = runSms(["run", "--dry-run", "demo"], homeDir);
    expect(dryRunBefore.exitCode).toBe(0);
    expect(decode(dryRunBefore.stdout)).toContain("Env overrides:");
    expect(decode(dryRunBefore.stdout)).toContain("FOO=bar");

    const cleared = runSms(["update", "demo", "--clear-env"], homeDir);
    expect(cleared.exitCode).toBe(0);
    expect(decode(cleared.stdout)).toContain("Cleared env overrides for 'demo'");

    const envAfter = runSms(["env", "demo"], homeDir);
    expect(envAfter.exitCode).toBe(0);
    expect(decode(envAfter.stdout)).toBe("No env overrides set for 'demo'");

    const dryRunAfter = runSms(["run", "--dry-run", "demo"], homeDir);
    expect(dryRunAfter.exitCode).toBe(0);
    expect(decode(dryRunAfter.stdout)).toContain("Env overrides: none");
  });

  test("rejects combining --env with --clear-env", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const result = runSms(["update", "demo", "--env", "FOO=bar", "--clear-env"], homeDir);
    expect(result.exitCode).toBe(2);
    expect(decode(result.stderr)).toContain("--env and --clear-env cannot be used together");
  });
});
