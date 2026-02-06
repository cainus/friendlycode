import { Project, SourceFile } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import { thresholds } from "../../config";
import * as path from "path";
import * as fs from "fs";

export function analyzeCodeNoise(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeDeadExports(project, rootPath),
    analyzeCommentedOutCode(sourceFiles, rootPath),
    analyzeStaleTodos(sourceFiles, rootPath),
  ];
}

function analyzeDeadExports(project: Project, rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const sourceFiles = project.getSourceFiles();

  // Build a map of all imports across the project
  const importedNames = new Set<string>();
  for (const file of sourceFiles) {
    for (const imp of file.getImportDeclarations()) {
      for (const named of imp.getNamedImports()) {
        importedNames.add(named.getName());
      }
      const defaultImport = imp.getDefaultImport();
      if (defaultImport) {
        importedNames.add(defaultImport.getText());
      }
    }
  }

  // Check exports that are never imported anywhere
  let deadExportCount = 0;
  let totalExports = 0;

  for (const file of sourceFiles) {
    const relPath = path.relative(rootPath, file.getFilePath());
    // Skip index/barrel files and test files
    if (relPath.includes(".test.") || relPath.includes(".spec.") || path.basename(relPath) === "index.ts") {
      continue;
    }

    const exportedDecls = file.getExportedDeclarations();
    for (const [name] of exportedDecls) {
      totalExports++;
      if (name !== "default" && !importedNames.has(name)) {
        deadExportCount++;
        findings.push({
          file: relPath,
          message: `'${name}' is exported from ${relPath} but never imported`,
          severity: "info",
          value: 1,
        });
      }
    }
  }

  const liveRatio = totalExports > 0 ? 1 - deadExportCount / totalExports : 1;

  return {
    id: "6.1",
    score: liveRatio,
    findings: findings.slice(0, 30),
    summary: `${deadExportCount} of ${totalExports} exports appear unused (${((1 - liveRatio) * 100).toFixed(1)}%)`,
  };
}

function analyzeCommentedOutCode(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalCommentedBlocks = 0;
  let totalFiles = 0;

  // Patterns that look like commented-out code (not regular comments)
  const codePatterns = [
    /^\/\/\s*(const|let|var|function|class|import|export|if|for|while|return|await|try|catch)\s/,
    /^\/\/\s*\w+\.\w+\(/,          // method calls: // foo.bar(
    /^\/\/\s*\w+\s*=\s*/,           // assignments: // x = ...
    /^\/\/\s*}\s*$/,                 // closing braces: // }
    /^\/\/\s*\w+\([^)]*\)\s*[{;]/,  // function calls: // foo() {
  ];

  for (const file of files) {
    totalFiles++;
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();
    const lines = text.split("\n");
    let fileCommentedBlocks = 0;
    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      const isCommentedCode = codePatterns.some((p) => p.test(line));

      if (isCommentedCode) {
        if (!inBlock) {
          fileCommentedBlocks++;
          inBlock = true;
        }
      } else {
        inBlock = false;
      }
    }

    if (fileCommentedBlocks > 2) {
      totalCommentedBlocks += fileCommentedBlocks;
      findings.push({
        file: relPath,
        message: `${relPath} has ${fileCommentedBlocks} blocks of commented-out code`,
        severity: fileCommentedBlocks > 5 ? "warning" : "info",
        value: fileCommentedBlocks,
      });
    }
  }

  const score = totalFiles > 0 ? Math.max(0, 1 - totalCommentedBlocks / (totalFiles * 2)) : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "6.2",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 30),
    summary: `${totalCommentedBlocks} blocks of commented-out code found across ${findings.length} files`,
  };
}

function analyzeStaleTodos(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalTodos = 0;

  const todoPattern = /\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/i;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();
    const lines = text.split("\n");
    let fileTodos = 0;

    for (let i = 0; i < lines.length; i++) {
      if (todoPattern.test(lines[i]!)) {
        fileTodos++;
        totalTodos++;
      }
    }

    if (fileTodos > 0) {
      findings.push({
        file: relPath,
        message: `${relPath} has ${fileTodos} TODO/FIXME/HACK comments`,
        severity: fileTodos > 5 ? "warning" : "info",
        value: fileTodos,
      });
    }
  }

  let score: number;
  if (totalTodos <= thresholds.todoCount.good) {
    score = 1;
  } else if (totalTodos <= thresholds.todoCount.acceptable) {
    score = 0.7;
  } else if (totalTodos <= thresholds.todoCount.bad) {
    score = 0.4;
  } else {
    score = Math.max(0, 0.2 - (totalTodos - thresholds.todoCount.bad) / 500);
  }

  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "6.4",
    score,
    findings: findings.slice(0, 30),
    summary: `${totalTodos} TODO/FIXME/HACK comments found across ${findings.length} files`,
  };
}
