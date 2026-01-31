#!/usr/bin/env bun
/**
 * SMS Script Templates
 */

import * as fs from "fs";
import * as path from "path";
import { SCRIPTS_DIR } from "./config";

export function resolveTemplateName(name: string, type: "bash" | "python" | "ts"): string {
  const ext = path.extname(name);
  if (ext) return name;
  if (type === "bash") return `${name}.sh`;
  if (type === "python") return `${name}.py`;
  return `${name}.ts`;
}

export function templateFor(type: "bash" | "python" | "ts", scriptName: string): string {
  if (type === "bash") {
    return [
      `#!/usr/bin/env bash`,
      `set -euo pipefail`,
      ``,
      `usage() {`,
      `  cat <<'EOF'`,
      `Usage:`,
      `  ${scriptName} [options] <input>`,
      ``,
      `Options:`,
      `  -o, --output <path>   Output file (default: stdout)`,
      `  -h, --help            Show this help`,
      `EOF`,
      `}`,
      ``,
      `output=""`,
      ``,
      `while [[ $# -gt 0 ]]; do`,
      `  case "$1" in`,
      `    -o|--output)`,
      `      output="${'${2:-}'}"`,
      `      shift 2`,
      `      ;;`,
      `    -h|--help)`,
      `      usage`,
      `      exit 0`,
      `      ;;`,
      `    -*)`,
      `      echo "Error: Unknown option $1" >&2`,
      `      usage >&2`,
      `      exit 2`,
      `      ;;`,
      `    *)`,
      `      break`,
      `      ;;`,
      `  esac`,
      `done`,
      ``,
      `input="${'${1:-}'}"`,
      `if [[ -z "$input" ]]; then`,
      `  echo "Error: Missing <input>" >&2`,
      `  usage >&2`,
      `  exit 2`,
      `fi`,
      ``,
      `# Core logic here`,
      `echo "input=$input"`,
      ``
    ].join("\n");
  }

  if (type === "python") {
    return [
      `#!/usr/bin/env python3`,
      `# /// script`,
      `# requires-python = ">=3.11"`,
      `# dependencies = [`,
      `# ]`,
      `# ///`,
      `import argparse`,
      `import sys`,
      ``,
      `def build_parser() -> argparse.ArgumentParser:`,
      `    parser = argparse.ArgumentParser(`,
      `        prog="${scriptName}",`,
      `        description="Describe what this script does."`,
      `    )`,
      `    parser.add_argument("input", help="Input file path")`,
      `    parser.add_argument("-o", "--output", help="Output file (default: stdout)")`,
      `    return parser`,
      ``,
      `def main(argv: list[str]) -> int:`,
      `    parser = build_parser()`,
      `    args = parser.parse_args(argv)`,
      `    # Core logic here`,
      `    print(f"input={args.input}")`,
      `    return 0`,
      ``,
      `if __name__ == "__main__":`,
      `    raise SystemExit(main(sys.argv[1:]))`,
      ``
    ].join("\n");
  }

  return [
    `#!/usr/bin/env bun`,
    `// ${scriptName} - describe what this script does.`,
    ``,
    `function usage(): void {`,
    `  console.log(\`Usage:`,
    `  ${scriptName} [options] <input>`,
    ``,
    `Options:`,
    `  -o, --output <path>   Output file (default: stdout)`,
    `  -h, --help            Show this help`,
    `\`);`,
    `}`,
    ``,
    `const args = process.argv.slice(2);`,
    `let output = "";`,
    ``,
    `while (args.length > 0) {`,
    `  const token = args[0];`,
    `  if (token === "-o" || token === "--output") {`,
    `    output = args[1] || "";`,
    `    args.splice(0, 2);`,
    `    continue;`,
    `  }`,
    `  if (token === "-h" || token === "--help") {`,
    `    usage();`,
    `    process.exit(0);`,
    `  }`,
    `  if (token.startsWith("-")) {`,
    `    console.error(\`Error: Unknown option \${token}\`);`,
    `    usage();`,
    `    process.exit(2);`,
    `  }`,
    `  break;`,
    `}`,
    ``,
    `const input = args[0];`,
    `if (!input) {`,
    `  console.error("Error: Missing <input>");`,
    `  usage();`,
    `  process.exit(2);`,
    `}`,
    ``,
    `// Core logic here`,
    `console.log(\`input=\${input}\`);`,
    ``
  ].join("\n");
}

export function writeTemplateFile(targetPath: string, content: string, force: boolean): void {
  if (fs.existsSync(targetPath) && !force) {
    console.error(`Error: File already exists: ${targetPath}`);
    console.error("Use --force to overwrite");
    process.exit(1);
  }
  fs.writeFileSync(targetPath, content, "utf-8");
  try {
    fs.chmodSync(targetPath, 0o755);
  } catch {
    // ignore
  }
}
