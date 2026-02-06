import { Project, SourceFile, FunctionDeclaration, MethodDeclaration, ArrowFunction, FunctionExpression, Node, SyntaxKind } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import { thresholds } from "../../config";
import * as path from "path";

type FunctionLike = FunctionDeclaration | MethodDeclaration | ArrowFunction | FunctionExpression;

export function analyzeFunctionMetrics(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  const allFunctions: { fn: FunctionLike; file: SourceFile }[] = [];
  for (const file of sourceFiles) {
    const fns = getFunctionsInFile(file);
    for (const fn of fns) {
      allFunctions.push({ fn, file });
    }
  }

  return [
    analyzeFunctionLength(allFunctions, rootPath),
    analyzeParamCount(allFunctions, rootPath),
    analyzeBooleanParams(allFunctions, rootPath),
    analyzeNestingDepth(allFunctions, rootPath),
  ];
}

function getFunctionsInFile(file: SourceFile): FunctionLike[] {
  const results: FunctionLike[] = [];
  results.push(...file.getFunctions());
  for (const cls of file.getClasses()) {
    results.push(...cls.getMethods());
  }
  // Get arrow functions and function expressions assigned to variables
  for (const varDecl of file.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      results.push(init);
    }
  }
  return results;
}

function getFunctionName(fn: FunctionLike): string {
  if (Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn)) {
    return fn.getName() ?? "<anonymous>";
  }
  // For arrow/function expressions, try to get the variable name
  const parent = fn.getParent();
  if (parent && Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }
  return "<anonymous>";
}

function getFunctionLineCount(fn: FunctionLike): number {
  const start = fn.getStartLineNumber();
  const end = fn.getEndLineNumber();
  return end - start + 1;
}

function analyzeFunctionLength(fns: { fn: FunctionLike; file: SourceFile }[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const { fn, file } of fns) {
    const lineCount = getFunctionLineCount(fn);
    const relPath = path.relative(rootPath, file.getFilePath());
    const name = getFunctionName(fn);

    if (lineCount > thresholds.functionLength.acceptable) {
      findings.push({
        file: relPath,
        line: fn.getStartLineNumber(),
        message: `${name} in ${relPath}:${fn.getStartLineNumber()} is ${lineCount} lines`,
        severity: lineCount > thresholds.functionLength.bad ? "error" : "warning",
        value: lineCount,
      });
    }

    if (lineCount <= thresholds.functionLength.good) {
      totalScore += 1;
    } else if (lineCount <= thresholds.functionLength.acceptable) {
      totalScore += 0.7;
    } else if (lineCount <= thresholds.functionLength.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = fns.length > 0 ? totalScore / fns.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "5.1",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} of ${fns.length} functions exceed ${thresholds.functionLength.acceptable} lines`,
  };
}

function analyzeParamCount(fns: { fn: FunctionLike; file: SourceFile }[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const { fn, file } of fns) {
    const paramCount = fn.getParameters().length;
    const relPath = path.relative(rootPath, file.getFilePath());
    const name = getFunctionName(fn);

    if (paramCount > thresholds.paramCount.acceptable) {
      findings.push({
        file: relPath,
        line: fn.getStartLineNumber(),
        message: `${name} in ${relPath}:${fn.getStartLineNumber()} has ${paramCount} parameters — consider using an options object`,
        severity: paramCount > thresholds.paramCount.bad ? "error" : "warning",
        value: paramCount,
      });
    }

    if (paramCount <= thresholds.paramCount.good) {
      totalScore += 1;
    } else if (paramCount <= thresholds.paramCount.acceptable) {
      totalScore += 0.7;
    } else if (paramCount <= thresholds.paramCount.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = fns.length > 0 ? totalScore / fns.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "5.2",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} of ${fns.length} functions have more than ${thresholds.paramCount.acceptable} parameters`,
  };
}

function analyzeBooleanParams(fns: { fn: FunctionLike; file: SourceFile }[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalBoolParams = 0;
  let totalParams = 0;

  for (const { fn, file } of fns) {
    const params = fn.getParameters();
    totalParams += params.length;

    for (const param of params) {
      const typeNode = param.getTypeNode();
      const typeText = typeNode?.getText() ?? param.getType().getText();
      if (typeText === "boolean") {
        totalBoolParams++;
        const relPath = path.relative(rootPath, file.getFilePath());
        const name = getFunctionName(fn);
        findings.push({
          file: relPath,
          line: fn.getStartLineNumber(),
          message: `${name} in ${relPath}:${fn.getStartLineNumber()} has boolean param '${param.getName()}' — consider named options`,
          severity: "warning",
          value: 1,
        });
      }
    }
  }

  const boolRatio = totalParams > 0 ? totalBoolParams / totalParams : 0;
  // Low ratio of boolean params = good. Score inversely.
  const score = Math.max(0, 1 - boolRatio * 10); // 10% boolean params = score 0

  return {
    id: "5.3",
    score,
    findings: findings.slice(0, 30),
    summary: `${totalBoolParams} boolean parameters found across ${fns.length} functions (${(boolRatio * 100).toFixed(1)}% of all params)`,
  };
}

function analyzeNestingDepth(fns: { fn: FunctionLike; file: SourceFile }[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const { fn, file } of fns) {
    const maxDepth = getMaxNestingDepth(fn);
    const relPath = path.relative(rootPath, file.getFilePath());
    const name = getFunctionName(fn);

    if (maxDepth > thresholds.nestingDepth.acceptable) {
      findings.push({
        file: relPath,
        line: fn.getStartLineNumber(),
        message: `${name} in ${relPath}:${fn.getStartLineNumber()} has nesting depth ${maxDepth} — consider early returns or extraction`,
        severity: maxDepth > thresholds.nestingDepth.bad ? "error" : "warning",
        value: maxDepth,
      });
    }

    if (maxDepth <= thresholds.nestingDepth.good) {
      totalScore += 1;
    } else if (maxDepth <= thresholds.nestingDepth.acceptable) {
      totalScore += 0.7;
    } else if (maxDepth <= thresholds.nestingDepth.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = fns.length > 0 ? totalScore / fns.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "5.6",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} functions with nesting depth exceeding ${thresholds.nestingDepth.acceptable}`,
  };
}

function getMaxNestingDepth(node: Node): number {
  const nestingKinds = new Set([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
  ]);

  let maxDepth = 0;

  function walk(n: Node, depth: number) {
    if (nestingKinds.has(n.getKind())) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
    for (const child of n.getChildren()) {
      walk(child, depth);
    }
  }

  walk(node, 0);
  return maxDepth;
}
