import { Project, SourceFile } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import * as path from "path";

export function analyzeImportGraph(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();
  const graph = buildImportGraph(sourceFiles, rootPath);

  return [
    analyzeCircularDeps(graph, rootPath),
    analyzeBarrelFiles(sourceFiles, rootPath),
    analyzeMaxImportDepth(graph, rootPath),
    analyzeFilesPerFeature(graph, rootPath),
    analyzeInheritanceDepth(sourceFiles, rootPath),
    analyzeMiddlewareChains(sourceFiles, rootPath),
  ];
}

type ImportGraph = Map<string, Set<string>>; // file -> set of imported files

function buildImportGraph(files: SourceFile[], rootPath: string): ImportGraph {
  const graph: ImportGraph = new Map();

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const imports = new Set<string>();

    for (const imp of file.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      // Only track relative imports (local project files)
      if (moduleSpecifier.startsWith(".")) {
        const sourceFile = imp.getModuleSpecifierSourceFile();
        if (sourceFile) {
          imports.add(path.relative(rootPath, sourceFile.getFilePath()));
        }
      }
    }

    graph.set(relPath, imports);
  }

  return graph;
}

function analyzeCircularDeps(graph: ImportGraph, rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const cycles: string[][] = [];

  // Detect cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, pathStack: string[]): void {
    if (inStack.has(node)) {
      // Found a cycle
      const cycleStart = pathStack.indexOf(node);
      if (cycleStart >= 0) {
        const cycle = pathStack.slice(cycleStart);
        cycle.push(node);
        if (cycles.length < 50) {
          cycles.push(cycle);
        }
      }
      return;
    }
    if (visited.has(node)) { return; }

    visited.add(node);
    inStack.add(node);
    pathStack.push(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep, [...pathStack]);
      }
    }

    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    visited.clear();
    inStack.clear();
    dfs(node, []);
    if (cycles.length >= 50) { break; }
  }

  for (const cycle of cycles.slice(0, 20)) {
    findings.push({
      file: cycle[0] ?? "",
      message: `Circular dependency: ${cycle.join(" → ")}`,
      severity: "error",
    });
  }

  const totalFiles = graph.size;
  const filesInCycles = new Set(cycles.flat()).size;
  const score = totalFiles > 0 ? Math.max(0, 1 - filesInCycles / totalFiles * 5) : 1;

  return {
    id: "10.3",
    score: Math.max(0, Math.min(1, score)),
    findings,
    summary: `${cycles.length} circular dependency cycles found involving ${filesInCycles} files`,
  };
}

function analyzeBarrelFiles(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let barrelCount = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const fileName = path.basename(relPath);

    if (fileName !== "index.ts" && fileName !== "index.tsx") { continue; }

    const exportDecls = file.getExportDeclarations();
    const stmtCount = file.getStatements().length;

    // A barrel file is mostly re-exports
    if (exportDecls.length > 0 && exportDecls.length >= stmtCount * 0.5) {
      barrelCount++;
      findings.push({
        file: relPath,
        message: `${relPath} is a barrel file with ${exportDecls.length} re-exports — adds import indirection`,
        severity: exportDecls.length > 10 ? "warning" : "info",
        value: exportDecls.length,
      });
    }
  }

  const totalFiles = files.length;
  const score = totalFiles > 0 ? Math.max(0, 1 - barrelCount / totalFiles * 10) : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "10.4",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${barrelCount} barrel/index files found`,
  };
}

function analyzeMaxImportDepth(graph: ImportGraph, rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  // Calculate max depth from each file using BFS
  const depths = new Map<string, number>();

  function getDepth(file: string, visited: Set<string>): number {
    if (visited.has(file)) { return 0; }
    if (depths.has(file)) { return depths.get(file)!; }

    visited.add(file);
    const deps = graph.get(file);
    if (!deps || deps.size === 0) {
      depths.set(file, 0);
      return 0;
    }

    let maxChildDepth = 0;
    for (const dep of deps) {
      maxChildDepth = Math.max(maxChildDepth, getDepth(dep, visited));
    }

    const depth = maxChildDepth + 1;
    depths.set(file, depth);
    visited.delete(file);
    return depth;
  }

  for (const file of graph.keys()) {
    getDepth(file, new Set());
  }

  // Find files with the deepest import chains
  const sortedByDepth = Array.from(depths.entries()).sort((a, b) => b[1] - a[1]);

  for (const [file, depth] of sortedByDepth.slice(0, 20)) {
    if (depth > 8) {
      findings.push({
        file,
        message: `${file} has an import chain depth of ${depth}`,
        severity: depth > 15 ? "error" : "warning",
        value: depth,
      });
    }
  }

  const maxDepth = sortedByDepth.length > 0 ? sortedByDepth[0]![1] : 0;
  let score: number;
  if (maxDepth <= 5) { score = 1; }
  else if (maxDepth <= 10) { score = 0.7; }
  else if (maxDepth <= 15) { score = 0.4; }
  else { score = 0.2; }

  return {
    id: "10.6",
    score,
    findings,
    summary: `Maximum import chain depth: ${maxDepth}`,
  };
}

function analyzeFilesPerFeature(graph: ImportGraph, rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  // For each entry-point-like file, count how many files it transitively imports
  const entryPatterns = ["resource", "route", "handler", "controller", "endpoint"];
  const entryFiles = Array.from(graph.keys()).filter((f) =>
    entryPatterns.some((p) => f.toLowerCase().includes(p))
  );

  const transitiveImports = new Map<string, number>();

  for (const entry of entryFiles) {
    const visited = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) { continue; }
      visited.add(current);
      const deps = graph.get(current);
      if (deps) {
        for (const dep of deps) {
          queue.push(dep);
        }
      }
    }
    transitiveImports.set(entry, visited.size);
  }

  const sorted = Array.from(transitiveImports.entries()).sort((a, b) => b[1] - a[1]);

  for (const [file, count] of sorted.slice(0, 20)) {
    if (count > 15) {
      findings.push({
        file,
        message: `${file} transitively imports ${count} files — understanding this feature requires reading many files`,
        severity: count > 30 ? "error" : "warning",
        value: count,
      });
    }
  }

  const avgImports = sorted.length > 0 ? sorted.reduce((sum, [, c]) => sum + c, 0) / sorted.length : 0;
  let score: number;
  if (avgImports <= 5) { score = 1; }
  else if (avgImports <= 10) { score = 0.8; }
  else if (avgImports <= 20) { score = 0.5; }
  else { score = 0.2; }

  return {
    id: "10.7",
    score,
    findings,
    summary: `Entry-point files average ${avgImports.toFixed(0)} transitive imports`,
  };
}

function analyzeInheritanceDepth(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let maxDepth = 0;
  let deepClasses = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());

    for (const cls of file.getClasses()) {
      let depth = 0;
      let current = cls;
      const visited = new Set<string>();

      while (true) {
        const baseClass = current.getExtends();
        if (!baseClass) { break; }

        const baseText = baseClass.getText();
        if (visited.has(baseText)) { break; }
        visited.add(baseText);

        depth++;
        // Try to resolve the base class
        const baseDecl = baseClass.getType().getSymbol()?.getDeclarations()?.[0];
        if (baseDecl && baseDecl.getSourceFile() !== undefined) {
          const baseClassNode = baseDecl.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
          if (baseClassNode) {
            current = baseClassNode;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      maxDepth = Math.max(maxDepth, depth);
      if (depth > 2) {
        deepClasses++;
        findings.push({
          file: relPath,
          line: cls.getStartLineNumber(),
          message: `${cls.getName() ?? "<anonymous>"} in ${relPath} has inheritance depth ${depth}`,
          severity: depth > 3 ? "error" : "warning",
          value: depth,
        });
      }
    }
  }

  let score: number;
  if (maxDepth <= 1) { score = 1; }
  else if (maxDepth <= 2) { score = 0.8; }
  else if (maxDepth <= 3) { score = 0.5; }
  else { score = 0.2; }

  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "10.1",
    score,
    findings: findings.slice(0, 20),
    summary: `Max inheritance depth: ${maxDepth}, ${deepClasses} classes with depth > 2`,
  };
}

// Need SyntaxKind for the class resolution
import { SyntaxKind } from "ts-morph";

function analyzeMiddlewareChains(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  // Heuristic: look for arrays of middleware (common patterns)
  // e.g., [auth, validate, rateLimit, transform, handler]
  // or .use(a).use(b).use(c) chains
  let longChains = 0;
  let totalChains = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();

    // Pattern 1: Array literals that look like middleware arrays
    const arrayPattern = /\[\s*(\w+\s*,\s*){4,}/g;
    let match;
    while ((match = arrayPattern.exec(text)) !== null) {
      totalChains++;
      const commaCount = (match[0].match(/,/g) ?? []).length;
      if (commaCount > 5) {
        longChains++;
        findings.push({
          file: relPath,
          message: `${relPath} has a chain of ${commaCount + 1} middleware/handlers`,
          severity: commaCount > 8 ? "error" : "warning",
          value: commaCount + 1,
        });
      }
    }

    // Pattern 2: .use() chains
    const useChainPattern = /\.use\([^)]+\)/g;
    const useMatches = text.match(useChainPattern) ?? [];
    if (useMatches.length > 5) {
      totalChains++;
      longChains++;
      findings.push({
        file: relPath,
        message: `${relPath} has ${useMatches.length} .use() calls`,
        severity: useMatches.length > 10 ? "error" : "warning",
        value: useMatches.length,
      });
    }
  }

  const score = totalChains > 0 ? Math.max(0, 1 - longChains / totalChains) : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "10.2",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${longChains} long middleware/handler chains detected`,
  };
}
