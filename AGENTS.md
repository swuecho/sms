# Repository Guidelines

## Project Structure & Module Organization
This repository is a Bun + TypeScript CLI for script alias management.

- `sms.ts`: CLI entrypoint and command routing.
- `src/commands.ts`: command implementations (`add`, `run`, `init`, `doctor`, etc.).
- `src/utils.ts`: Git/index helpers and script execution logic.
- `src/templates.ts`: Python/TypeScript script templates.
- `src/config.ts`: path constants (for `~/.sms` layout).
- `src/types.ts`: shared TypeScript types.
- `README.md`: usage docs and operational behavior.

There is currently no dedicated `test/` directory.

## Build, Test, and Development Commands
Use Bun for local development:

- `bun install`: install dependencies.
- `bun run start -- help`: run the CLI in dev mode.
- `bun run start -- list`: example command invocation.
- `bun run build`: compile a standalone binary to `./sms`.

If you generate `./sms`, avoid committing it unless release packaging is intended.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules).
- Indentation: 2 spaces; semicolons enabled.
- Naming:
- `camelCase` for variables/functions (`runCommand`).
- `PascalCase` for interfaces/types (`ScriptEntry`).
- Keep command handlers small and route reusable logic into `src/utils.ts`.
- Prefer explicit error messages and non-zero exits for CLI misuse.

No formatter/linter is currently configured; keep style consistent with existing files.

## Testing Guidelines
Automated tests are not set up yet. Before opening a PR:

- Run `bun run build` to verify compilation.
- Smoke test core flows manually, for example:
- `bun run start -- init demo --type python --no-add`
- `bun run start -- help`
- `bun run start -- doctor`

When adding tests, place them under `test/` and use `*.test.ts` naming.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries (e.g., `Refactor SMS module...`, `Update README...`).

- Commit message pattern: `Verb + scope + outcome` (e.g., `Add uv-based python execution`).
- Keep commits focused and logically grouped.
- PRs should include:
- what changed and why,
- impact on CLI behavior,
- manual verification steps/commands run,
- linked issue (if any).

If help text or command behavior changes, update `README.md` in the same PR.
