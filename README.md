# FriendlyCode

A CLI tool that scores how easily an LLM can work with your TypeScript codebase, out of 100.

It evaluates 63 sub-issues across 10 categories, produces a detailed report with per-file findings, and gives concrete, ranked recommendations for improvement.

## Quick Start

```bash
cd ~/friendlycode
pnpm install
pnpm run build

# Static analysis only (no API key needed)
NODE_OPTIONS="--max-old-space-size=8192" node dist/index.js analyze /path/to/codebase --skip-llm --output-dir ./output

# Full analysis (static + LLM evaluation)
ANTHROPIC_API_KEY=sk-... NODE_OPTIONS="--max-old-space-size=8192" node dist/index.js analyze /path/to/codebase --output-dir ./output
```

## CLI Usage

```
friendlycode analyze <path> [options]

Arguments:
  path                    Path to the codebase root

Options:
  --skip-llm              Skip LLM-based analysis (static only)
  --output-dir <dir>      Output directory for reports (default: ".")
  -V, --version           Output version number
  -h, --help              Display help
```

## What It Measures

Each category is worth 10 points (total: 100). Within each category, sub-issues split the points equally and score on a 0-1 continuous scale.

| # | Category | Sub-issues | What It Checks |
|---|----------|------------|----------------|
| 1 | Consistent Patterns | 5 | Structural consistency, error handling, naming conventions, API patterns, test patterns |
| 2 | Explicit Over Implicit | 6 | Metaprogramming, decorators, DI, convention-based routing, prototype mutation, dynamic access |
| 3 | Strong Typing | 6 | `any` usage, untyped signatures, schema validation, domain types, type assertions, typed config |
| 4 | Predictable File Structure | 6 | Domain organization, file naming, test colocation, file length, directory depth, exports per file |
| 5 | Small Focused Units | 6 | Function length, parameter count, boolean params, single responsibility, module focus, nesting depth |
| 6 | Clean Signal-to-Noise | 7 | Dead exports, commented-out code, duplication, stale TODOs, boilerplate, unnecessary abstraction, config minimality |
| 7 | Good Naming | 7 | Descriptive names, name uniqueness, boolean prefixes, function verb prefixes, abbreviations, domain language, file-export match |
| 8 | Architectural Documentation | 6 | README/CLAUDE.md existence, documented conventions, business rules, data flow, migration context, docs proximity |
| 9 | Tests | 7 | Tests as docs, test existence ratio, determinism, isolation, description quality, fixture simplicity, edge cases |
| 10 | Shallow Dependencies | 7 | Inheritance depth, middleware chains, circular deps, barrel files, side effects, import depth, files-per-feature |

35 sub-issues are evaluated via static analysis (ts-morph AST + text patterns). 28 are evaluated by sending sampled files to Claude for subjective assessment.

## Output

Two report files are written to the output directory:

- **`friendlycode-report.json`** -- Full machine-readable report with all scores, per-file findings, and metadata
- **`friendlycode-report.md`** -- Human-readable report with score bars, category breakdowns, ranked recommendations, and worst-offender files

### Example Output (console)

```
FriendlyCode -- Codebase LLM-Readability Scorer

Analyzing: /Users/you/your-project
Output:    /Users/you/friendlycode/output
LLM:       Skipped (--skip-llm)

Overall Score: 62.09/100

   1. Consistent Patterns            4.9/10  ██████████░░░░░░░░░░
   2. Explicit Over Implicit         8.2/10  ████████████████░░░░
   3. Strong Typing                  6.0/10  ████████████░░░░░░░░
   4. Predictable File Structure     6.6/10  █████████████████░░░
   5. Small Focused Units            7.9/10  ████████████████░░░░
   6. Clean Signal-to-Noise          4.7/10  █████████░░░░░░░░░░░
   7. Good Naming                    5.1/10  ██████████░░░░░░░░░░
   8. Architectural Documentation    5.8/10  ████████████░░░░░░░░
   9. Tests                          5.4/10  ███████████░░░░░░░░░
  10. Shallow Dependencies           7.4/10  ███████████████░░░░░
```

## Large Codebases

For projects with more than 2,000 source files, the tool automatically samples a representative subset for expensive AST operations (function analysis, type checking, naming analysis). Cheaper text-based checks still run on the full set. The `--max-old-space-size=8192` flag is recommended for large codebases to give Node enough heap.

## Dependencies

| Package | Purpose |
|---------|---------|
| `ts-morph` | TypeScript AST parsing and analysis |
| `commander` | CLI argument parsing |
| `chalk` | Terminal output coloring |
| `@anthropic-ai/sdk` | Claude API for LLM evaluation (optional, only used without `--skip-llm`) |
