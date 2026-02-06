# Architecture

## Overview

FriendlyCode is a two-phase analysis pipeline: static analysis via ts-morph, then optional LLM evaluation via the Claude API. Both phases produce `SubIssueResult` objects that feed into a shared scoring system, which aggregates them into a final report.

```
CLI (index.ts)
  |
  v
Scanner (scanner.ts)
  |
  +-- Phase 1: Static Analyzers (9 modules, 35 sub-issues)
  |     |
  |     +-- ts-morph Project --> each analyzer module
  |
  +-- Phase 2: LLM Evaluator (28 sub-issues, optional)
  |     |
  |     +-- Sampler --> picks representative files
  |     +-- Evaluator --> sends to Claude API with rubric
  |
  +-- Scoring (scoring.ts)
  |     |
  |     +-- Aggregates SubIssueResults into CategoryResults
  |     +-- Generates ranked Recommendations
  |
  +-- Reporters
        |
        +-- JSON (reporter/json.ts)
        +-- Markdown (reporter/markdown.ts)
```

## File Responsibilities

### Entry Point

**`src/index.ts`** -- CLI definition using `commander`. Parses arguments and calls `scan()`.

### Orchestration

**`src/scanner.ts`** -- The main orchestrator. Responsibilities:
- Finds and loads the tsconfig
- Creates the ts-morph `Project`
- Samples files for large codebases (>2000 files)
- Runs each static analyzer sequentially, collecting results
- Runs the LLM evaluator if enabled
- Passes all results to the scoring system
- Writes reports and prints the summary

### Configuration

**`src/config.ts`** -- Defines the complete rubric: all 10 categories and 63 sub-issues, each tagged as `"static"` or `"llm"`. Also contains threshold constants (e.g., what counts as a "long" function or "too many" exports) and helper functions for filtering sub-issues by type.

### Type System

**`src/analyzers/types.ts`** -- Core types shared across the codebase:
- `SubIssueResult` -- Score (0-1) + findings + summary for one sub-issue
- `CategoryResult` -- Score (0-10) + child sub-issues for one category
- `Finding` -- A single observation with file, line, message, severity
- `Report` -- The complete output: overall score, categories, recommendations, metadata
- `Recommendation` -- A ranked suggestion with impact score

## Static Analyzers

Each module in `src/analyzers/static/` receives a ts-morph `Project` and the root path, and returns an array of `SubIssueResult` objects. Each module covers related sub-issues:

| Module | Sub-Issues | Approach |
|--------|------------|----------|
| `fileMetrics.ts` | 4.4 file length, 4.5 directory depth, 4.6 exports per file | Iterates `SourceFile` metadata |
| `functionMetrics.ts` | 5.1 function length, 5.2 param count, 5.3 boolean params, 5.6 nesting depth | Extracts all function-like nodes (declarations, methods, arrow functions) and measures each |
| `typeUsage.ts` | 3.1 `any` count, 3.2 untyped signatures, 3.3 schema validation, 3.5 type assertions | AST node kind scanning + import analysis |
| `codeNoise.ts` | 6.1 dead exports, 6.2 commented-out code, 6.4 stale TODOs | Builds import map for dead exports; regex patterns for comments and TODOs |
| `namingPatterns.ts` | 1.3 naming consistency, 7.2 uniqueness, 7.3 boolean prefixes, 7.4 verb prefixes, 7.5 abbreviations, 7.7 file-export match | Exported declaration name analysis |
| `importGraph.ts` | 10.1 inheritance depth, 10.2 middleware chains, 10.3 circular deps, 10.4 barrel files, 10.6 import depth, 10.7 files-per-feature | Builds a directed graph of relative imports, then runs DFS/BFS for cycles, depth, and transitive closure |
| `consistency.ts` | 1.5 test pattern consistency | Compares assertion styles, setup patterns, and mock usage across test files |
| `explicitness.ts` | 2.1 metaprogramming, 2.2 decorators, 2.5 prototype mutation, 2.6 dynamic access | Text pattern matching + AST node counting |
| `testMetrics.ts` | 4.3 test colocation, 8.1 documentation, 9.2 test existence ratio, 9.5 test description quality | File name matching + regex extraction of `it()`/`describe()` strings |

### Scoring Approach

Each sub-issue scores 0 to 1. The logic varies by metric:

- **Threshold-based**: Compare a value against good/acceptable/bad thresholds (e.g., file length < 300 = 1.0, < 500 = 0.7, < 800 = 0.3, else 0)
- **Ratio-based**: Fraction of items meeting criteria (e.g., 80% of booleans have `is`/`has` prefix = score 0.8)
- **Count-based**: Penalize based on absolute count scaled to project size

Findings are sorted by severity/value and capped at 20-30 per sub-issue to keep reports manageable.

## LLM Evaluator

### Sampler (`src/analyzers/llm/sampler.ts`)

Selects 15 representative files for LLM evaluation by scoring each file on:
- Size (larger files are more representative)
- Import count (heavily imported files are structural pillars)
- File type (models, resources, handlers get priority)
- Recency (recently changed files via `git log`)

### Evaluator (`src/analyzers/llm/evaluator.ts`)

Sends sampled file contents to Claude in batches of 8 sub-issues per API call. Each batch includes:
- Truncated file contents (up to 3000 chars each)
- The specific rubric items to evaluate
- Instructions to return a JSON array of scores + findings

Falls back to neutral 0.5 scores on API failure or missing API key.

## Scoring System (`src/scoring.ts`)

Aggregation:
1. Each category has N sub-issues, each worth `10/N` points
2. A sub-issue's contribution = `score * (10/N)`
3. Category score = sum of sub-issue contributions (0-10)
4. Overall score = sum of category scores (0-100)

Recommendation generation:
1. For each sub-issue scoring below 0.8, calculate potential gain: `(1 - score) * (10/N)`
2. Use the top finding as the recommendation message
3. Sort by impact (potential points gained) descending
4. Return top 30

## Large Codebase Handling

For projects exceeding 2000 source files:
1. The scanner creates a sampled subset for AST analysis
2. Sampling prioritizes: models, resources, handlers, larger files, test files
3. 70% of the sample comes from highest-priority files, 30% is random for diversity
4. The full file set is still used for metadata (total line count) and project loading
5. `NODE_OPTIONS="--max-old-space-size=8192"` is recommended for heap

## Data Flow

```
ts-morph Project
    |
    v
[fileMetrics] [functionMetrics] [typeUsage] ...   <-- each returns SubIssueResult[]
    |              |                |
    +-------+------+------+---------+
            |
            v
    SubIssueResult[]  (35 static results)
            |
            + (28 LLM results if enabled)
            |
            v
    aggregateScores()
            |
            v
    Report { overallScore, categories[], recommendations[] }
            |
            +---> writeJsonReport()
            +---> writeMarkdownReport()
            +---> console summary
```
