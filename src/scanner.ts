import { Project, SourceFile } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import chalk from "chalk";

import { Report, SubIssueResult, ReportMetadata } from "./analyzers/types";
import { analyzeFileMetrics } from "./analyzers/static/fileMetrics";
import { analyzeFunctionMetrics } from "./analyzers/static/functionMetrics";
import { analyzeTypeUsage } from "./analyzers/static/typeUsage";
import { analyzeCodeNoise } from "./analyzers/static/codeNoise";
import { analyzeNamingPatterns } from "./analyzers/static/namingPatterns";
import { analyzeImportGraph } from "./analyzers/static/importGraph";
import { analyzeConsistency } from "./analyzers/static/consistency";
import { analyzeExplicitness } from "./analyzers/static/explicitness";
import { analyzeTestMetrics, analyzeDocumentation } from "./analyzers/static/testMetrics";
import { sampleFiles } from "./analyzers/llm/sampler";
import { evaluateWithLlm } from "./analyzers/llm/evaluator";
import { aggregateScores } from "./scoring";
import { writeJsonReport } from "./reporter/json";
import { writeMarkdownReport } from "./reporter/markdown";
import { writeHtmlReport } from "./reporter/html";

export type ScanOptions = {
  targetPath: string;
  llmProvider: "api" | "cli";
  outputDir: string;
};

export async function scan(options: ScanOptions): Promise<Report> {
  const startTime = Date.now();
  const rootPath = path.resolve(options.targetPath);

  console.log(chalk.bold("\nFriendlyCode — Codebase LLM-Readability Scorer\n"));
  console.log(`Analyzing: ${rootPath}`);
  console.log(`Output:    ${path.resolve(options.outputDir)}`);
  const llmLabel = options.llmProvider === "cli" ? "Claude CLI" : "API";
  console.log(`LLM:       ${llmLabel}\n`);

  // Find tsconfigs
  const tsconfigs = findAllTsConfigs(rootPath);
  if (tsconfigs.length > 0) {
    console.log(chalk.gray(`Found tsconfigs: ${tsconfigs.map(t => path.relative(rootPath, t)).join(", ")}`));
  } else {
    console.log(chalk.gray(`No tsconfig found — scanning all .ts/.tsx files`));
  }
  console.log("");

  // Create ts-morph project
  console.log(chalk.cyan("Loading project..."));
  const project = createProject(rootPath, tsconfigs);
  const allSourceFiles = project.getSourceFiles();
  console.log(chalk.green(`Found ${allSourceFiles.length} source files`));

  // For large projects, sample files for expensive AST analysis
  const MAX_FILES_FOR_FULL_AST = 2000;
  let sourceFiles = allSourceFiles;
  if (allSourceFiles.length > MAX_FILES_FOR_FULL_AST) {
    sourceFiles = sampleForAnalysis(allSourceFiles, MAX_FILES_FOR_FULL_AST);
    console.log(chalk.yellow(`  Sampling ${sourceFiles.length} files for detailed AST analysis (project has ${allSourceFiles.length})`));
  }
  console.log("");

  const totalLines = allSourceFiles.reduce((sum, f) => sum + f.getEndLineNumber(), 0);

  // Phase 1: Static Analysis
  console.log(chalk.cyan("Phase 1: Static Analysis"));
  const staticResults: SubIssueResult[] = [];

  // Create a sampled project for expensive AST operations
  const sampledProject = new Project({ skipFileDependencyResolution: true });
  for (const sf of sourceFiles) {
    sampledProject.addSourceFileAtPath(sf.getFilePath());
  }

  const analyzers = [
    { name: "File metrics", fn: () => analyzeFileMetrics(sampledProject, rootPath) },
    { name: "Function metrics", fn: () => analyzeFunctionMetrics(sampledProject, rootPath) },
    { name: "Type usage", fn: () => analyzeTypeUsage(sampledProject, rootPath) },
    { name: "Code noise", fn: () => analyzeCodeNoise(sampledProject, rootPath) },
    { name: "Naming patterns", fn: () => analyzeNamingPatterns(sampledProject, rootPath) },
    { name: "Import graph", fn: () => analyzeImportGraph(sampledProject, rootPath) },
    { name: "Consistency", fn: () => analyzeConsistency(sampledProject, rootPath) },
    { name: "Explicitness", fn: () => analyzeExplicitness(sampledProject, rootPath) },
    { name: "Test metrics", fn: () => analyzeTestMetrics(sampledProject, rootPath) },
  ];

  for (const analyzer of analyzers) {
    process.stdout.write(chalk.gray(`  ${analyzer.name}...`));
    try {
      const results = analyzer.fn();
      staticResults.push(...results);
      console.log(chalk.green(` ${results.length} sub-issues`));
    } catch (error) {
      console.log(chalk.red(` error: ${error instanceof Error ? error.message : "unknown"}`));
    }
  }

  // Documentation analysis (doesn't need ts-morph)
  process.stdout.write(chalk.gray("  Documentation..."));
  staticResults.push(analyzeDocumentation(rootPath));
  console.log(chalk.green(" 1 sub-issue"));

  console.log(chalk.green(`\nStatic analysis complete: ${staticResults.length} sub-issues evaluated\n`));

  // Phase 2: LLM Analysis
  console.log(chalk.cyan("Phase 2: LLM Analysis"));
  process.stdout.write(chalk.gray("  Sampling representative files..."));
  const sampled = sampleFiles(sampledProject, rootPath);
  console.log(chalk.green(` ${sampled.length} files selected`));

  for (const f of sampled) {
    console.log(chalk.gray(`    ${f.relativePath} (${f.reason})`));
  }
  console.log("");

  const llmResults = await evaluateWithLlm(sampled, options.llmProvider, (msg) => {
    console.log(chalk.gray(`  ${msg}`));
  });

  console.log(chalk.green(`\nLLM analysis complete: ${llmResults.length} sub-issues evaluated\n`));

  // Aggregate scores
  console.log(chalk.cyan("Scoring..."));
  const allResults = [...staticResults, ...llmResults];
  const { categories: categoryResults, overallScore, recommendations } = aggregateScores(allResults);

  const metadata: ReportMetadata = {
    analyzedPath: rootPath,
    timestamp: new Date().toISOString(),
    totalFiles: allSourceFiles.length,
    totalLines,
    llmAnalysisIncluded: true,
    durationMs: Date.now() - startTime,
  };

  const report: Report = {
    overallScore,
    categories: categoryResults,
    recommendations,
    metadata,
  };

  // Write reports
  const jsonPath = writeJsonReport(report, options.outputDir);
  const mdPath = writeMarkdownReport(report, options.outputDir);
  const htmlPath = writeHtmlReport(report, options.outputDir);

  console.log(chalk.bold.green(`\nOverall Score: ${overallScore}/100\n`));

  // Print quick summary
  for (const cat of categoryResults) {
    const bar = renderBar(cat.score, 10);
    console.log(`  ${cat.id.toString().padStart(2)}. ${cat.name.padEnd(28)} ${cat.score.toFixed(1).padStart(5)}/10  ${bar}`);
  }

  console.log(chalk.gray(`\nReports written to:`));
  console.log(chalk.gray(`  JSON:     ${jsonPath}`));
  console.log(chalk.gray(`  Markdown: ${mdPath}`));
  console.log(chalk.gray(`  HTML:     ${htmlPath}`));
  console.log(chalk.gray(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`));

  return report;
}

function findAllTsConfigs(rootPath: string): string[] {
  const results: string[] = [];

  // Check root first
  for (const name of ["tsconfig.json", "tsconfig.build.json"]) {
    const fullPath = path.join(rootPath, name);
    if (fs.existsSync(fullPath)) {
      results.push(fullPath);
    }
  }

  // Check immediate subdirectories for additional tsconfigs
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") continue;
    const subTsconfig = path.join(rootPath, entry.name, "tsconfig.json");
    if (fs.existsSync(subTsconfig)) {
      results.push(subTsconfig);
    }
  }

  return results;
}

function findAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllTsFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

function createProject(rootPath: string, tsconfigs: string[]): Project {
  const project = new Project({
    skipFileDependencyResolution: true,
  });

  // Load files from all tsconfigs
  for (const tsc of tsconfigs) {
    try {
      const sub = new Project({
        tsConfigFilePath: tsc,
        skipAddingFilesFromTsConfig: false,
        skipFileDependencyResolution: true,
      });
      for (const sf of sub.getSourceFiles()) {
        const fp = sf.getFilePath();
        if (!fp.includes("node_modules") && !project.getSourceFile(fp)) {
          project.addSourceFileAtPath(fp);
        }
      }
    } catch {
      // Skip broken tsconfigs
    }
  }

  // Also add any .ts/.tsx files on disk not yet in the project (e.g. test files excluded by tsconfig)
  const allTsFiles = findAllTsFiles(rootPath);
  for (const fp of allTsFiles) {
    if (!project.getSourceFile(fp)) {
      try {
        project.addSourceFileAtPath(fp);
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  // Fallback if nothing was loaded
  if (project.getSourceFiles().length === 0) {
    project.addSourceFilesAtPaths(path.join(rootPath, "**/*.ts"));
    project.addSourceFilesAtPaths(path.join(rootPath, "**/*.tsx"));
  }

  return project;
}

function sampleForAnalysis(files: SourceFile[], maxFiles: number): SourceFile[] {
  // Prioritize: models, resources, handlers, larger files, test files
  const scored = files.map((f) => {
    const fp = f.getFilePath().toLowerCase();
    let priority = 0;
    if (fp.includes("model")) { priority += 3; }
    if (fp.includes("resource") || fp.includes("route") || fp.includes("handler")) { priority += 3; }
    if (fp.includes(".test.") || fp.includes(".spec.")) { priority += 2; }
    if (fp.includes("middleware")) { priority += 1; }
    // Prefer larger files (more representative)
    const lineCount = f.getEndLineNumber();
    if (lineCount > 200) { priority += 2; }
    else if (lineCount > 50) { priority += 1; }
    // Deprioritize generated/declaration files
    if (fp.includes(".d.ts") || fp.includes("generated")) { priority -= 5; }
    return { file: f, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);

  // Take top-priority files but also include a random sample for diversity
  const topFiles = scored.slice(0, Math.floor(maxFiles * 0.7));
  const remainingFiles = scored.slice(Math.floor(maxFiles * 0.7));

  // Shuffle remaining and take the rest
  for (let i = remainingFiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingFiles[i], remainingFiles[j]] = [remainingFiles[j]!, remainingFiles[i]!];
  }
  const randomSample = remainingFiles.slice(0, maxFiles - topFiles.length);

  return [...topFiles, ...randomSample].map((s) => s.file);
}

function renderBar(score: number, max: number): string {
  const pct = score / max;
  const filled = Math.round(pct * 20);
  const empty = 20 - filled;

  if (pct >= 0.7) {
    return chalk.green("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
  } else if (pct >= 0.4) {
    return chalk.yellow("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
  } else {
    return chalk.red("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
  }
}
