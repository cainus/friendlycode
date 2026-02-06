import { Project, SourceFile, SyntaxKind } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import * as path from "path";

export function analyzeExplicitness(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeMetaprogramming(sourceFiles, rootPath),
    analyzeDecorators(sourceFiles, rootPath),
    analyzePrototypeMutation(sourceFiles, rootPath),
    analyzeDynamicAccess(sourceFiles, rootPath),
  ];
}

function analyzeMetaprogramming(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalInstances = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();
    let fileCount = 0;

    // Check for eval
    const evalMatches = text.match(/\beval\s*\(/g);
    if (evalMatches) {
      fileCount += evalMatches.length;
    }

    // Check for Function constructor
    const fnConstructor = text.match(/new\s+Function\s*\(/g);
    if (fnConstructor) {
      fileCount += fnConstructor.length;
    }

    // Check for Proxy
    const proxyUsage = text.match(/new\s+Proxy\s*\(/g);
    if (proxyUsage) {
      fileCount += proxyUsage.length;
    }

    // Check for Reflect
    const reflectUsage = text.match(/\bReflect\.\w+\(/g);
    if (reflectUsage) {
      fileCount += reflectUsage.length;
    }

    if (fileCount > 0) {
      totalInstances += fileCount;
      findings.push({
        file: relPath,
        message: `${relPath} uses metaprogramming (${fileCount} instances: eval/Function/Proxy/Reflect)`,
        severity: fileCount > 3 ? "error" : "warning",
        value: fileCount,
      });
    }
  }

  const score = Math.max(0, 1 - totalInstances / Math.max(files.length, 1) * 5);
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "2.1",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${totalInstances} metaprogramming instances (eval/Function/Proxy/Reflect) found`,
  };
}

function analyzeDecorators(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalDecorators = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    let decoratorCount = 0;

    file.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.Decorator) {
        decoratorCount++;
      }
    });

    if (decoratorCount > 0) {
      totalDecorators += decoratorCount;
      findings.push({
        file: relPath,
        message: `${relPath} uses ${decoratorCount} decorators — behavior is hidden behind annotations`,
        severity: decoratorCount > 5 ? "warning" : "info",
        value: decoratorCount,
      });
    }
  }

  const filesWithDecorators = findings.length;
  const score = files.length > 0 ? Math.max(0, 1 - filesWithDecorators / files.length * 3) : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "2.2",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${totalDecorators} decorators found across ${filesWithDecorators} files`,
  };
}

function analyzePrototypeMutation(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalInstances = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();

    const protoMatches = text.match(/\.prototype\.\w+\s*=/g);
    if (protoMatches) {
      totalInstances += protoMatches.length;
      findings.push({
        file: relPath,
        message: `${relPath} has ${protoMatches.length} prototype mutations`,
        severity: protoMatches.length > 2 ? "error" : "warning",
        value: protoMatches.length,
      });
    }
  }

  const score = Math.max(0, 1 - totalInstances / Math.max(files.length, 1) * 10);
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "2.5",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${totalInstances} prototype mutation(s) found`,
  };
}

function analyzeDynamicAccess(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalDynamic = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    let dynamicCount = 0;

    file.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.ElementAccessExpression) {
        // Check if the argument is a non-literal (dynamic)
        const children = node.getChildren();
        const accessArg = children[children.length - 2]; // The expression in brackets
        if (accessArg && accessArg.getKind() !== SyntaxKind.StringLiteral && accessArg.getKind() !== SyntaxKind.NumericLiteral) {
          dynamicCount++;
        }
      }
    });

    if (dynamicCount > 5) {
      totalDynamic += dynamicCount;
      findings.push({
        file: relPath,
        message: `${relPath} has ${dynamicCount} dynamic property accesses (obj[computed])`,
        severity: dynamicCount > 15 ? "warning" : "info",
        value: dynamicCount,
      });
    }
  }

  const avgDynamic = files.length > 0 ? totalDynamic / files.length : 0;
  const score = Math.max(0, 1 - avgDynamic / 5);
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "2.6",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${totalDynamic} dynamic property accesses found across ${findings.length} files`,
  };
}
