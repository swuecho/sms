import { describe, expect, test } from "bun:test";
import { completionCommand } from "../src/commands";

function captureCompletionOutput(shell?: string): string {
  const chunks: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    chunks.push(args.map((v) => String(v)).join(" "));
  };

  try {
    completionCommand(shell);
  } finally {
    console.log = originalLog;
  }

  return chunks.join("\n");
}

describe("completionCommand", () => {
  test("generates zsh completion with supported commands", () => {
    const out = captureCompletionOutput("zsh");

    expect(out).toContain("#compdef sms");
    expect(out).toContain("'run:Run a script by alias'");
    expect(out).toContain("'rename:Rename a script alias'");
    expect(out).toContain("'env:Show script env overrides'");
    expect(out).toContain("'llm:Show LLM usage guide'");
    expect(out).toContain("'completion:Generate shell completion'");
    expect(out).toContain("--type[Template type]:type:(python ts)");
  });

  test("generates fish completion with alias completion hooks", () => {
    const out = captureCompletionOutput("fish");

    expect(out).toContain("complete -c sms -n '__fish_use_subcommand' -a 'run'");
    expect(out).toContain("complete -c sms -n '__fish_use_subcommand' -a 'rename'");
    expect(out).toContain("complete -c sms -n '__fish_use_subcommand' -a 'env'");
    expect(out).toContain("complete -c sms -n '__fish_use_subcommand' -a 'llm'");
    expect(out).toContain("sms completion --aliases");
  });

  test("default output shows available shells", () => {
    const out = captureCompletionOutput();

    expect(out).toContain("Shell Completion Setup");
    expect(out).toContain("Available shells: zsh, fish");
    expect(out).toContain("Usage: sms completion <shell>");
    expect(out).toContain("sms completion install <shell>");
  });

  test("completion output does not advertise bash", () => {
    const zsh = captureCompletionOutput("zsh");
    const fish = captureCompletionOutput("fish");
    const info = captureCompletionOutput();

    expect(zsh).not.toContain("bash");
    expect(fish).not.toContain("bash");
    expect(info).not.toContain("bash");
  });
});
