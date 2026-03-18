import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
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

describe("completion install", () => {
  test("installs zsh completion and updates .zshrc", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const first = runSms(["completion", "install", "zsh"], homeDir);
    expect(first.exitCode).toBe(0);

    const completionPath = join(homeDir, ".zsh", "completions", "_sms");
    const zshrcPath = join(homeDir, ".zshrc");

    expect(existsSync(completionPath)).toBe(true);
    expect(readFileSync(completionPath, "utf-8")).toContain("#compdef sms");
    expect(readFileSync(zshrcPath, "utf-8")).toContain("fpath=(~/.zsh/completions $fpath)");
    expect(decode(first.stdout)).toContain("Installed zsh completion");

    const second = runSms(["completion", "install", "zsh"], homeDir);
    expect(second.exitCode).toBe(0);

    const zshrcContent = readFileSync(zshrcPath, "utf-8");
    expect(zshrcContent.match(/fpath=\(~\/\.zsh\/completions \$fpath\)/g)?.length).toBe(1);
  });

  test("installs fish completion", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "sms-home-"));
    tempDirs.push(homeDir);

    const result = runSms(["completion", "install", "fish"], homeDir);
    expect(result.exitCode).toBe(0);

    const completionPath = join(homeDir, ".config", "fish", "completions", "sms.fish");
    expect(existsSync(completionPath)).toBe(true);
    expect(readFileSync(completionPath, "utf-8")).toContain("complete -c sms");
    expect(decode(result.stdout)).toContain("Installed fish completion");
  });
});
