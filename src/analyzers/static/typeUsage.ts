import { Project, SourceFile, SyntaxKind, Node } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import { thresholds } from "../../config";
import * as path from "path";

export function analyzeTypeUsage(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeAnyUsage(sourceFiles, rootPath),
    analyzeUntypedSignatures(sourceFiles, rootPath),
    analyzeTypeAssertions(sourceFiles, rootPath),
  ];
}

function analyzeAnyUsage(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    let anyCount = 0;

    file.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.AnyKeyword) {
        anyCount++;
      }
    });

    if (anyCount > thresholds.anyPerFile.acceptable) {
      findings.push({
        file: relPath,
        message: `${relPath} has ${anyCount} uses of 'any'`,
        severity: anyCount > thresholds.anyPerFile.bad ? "error" : "warning",
        value: anyCount,
      });
    }

    if (anyCount <= thresholds.anyPerFile.good) {
      totalScore += 1;
    } else if (anyCount <= thresholds.anyPerFile.acceptable) {
      totalScore += 0.6;
    } else if (anyCount <= thresholds.anyPerFile.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = files.length > 0 ? totalScore / files.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "3.1",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} files with excessive 'any' usage`,
  };
}

function analyzeUntypedSignatures(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalFunctions = 0;
  let untypedCount = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());

    // Check function declarations
    for (const fn of file.getFunctions()) {
      totalFunctions++;
      const hasReturnType = fn.getReturnTypeNode() !== undefined;
      const untypedParams = fn.getParameters().filter((p) => !p.getTypeNode() && !p.getInitializer());

      if (!hasReturnType || untypedParams.length > 0) {
        untypedCount++;
        const issues: string[] = [];
        if (!hasReturnType) { issues.push("no return type"); }
        if (untypedParams.length > 0) {
          issues.push(`${untypedParams.length} untyped param(s): ${untypedParams.map((p) => p.getName()).join(", ")}`);
        }
        findings.push({
          file: relPath,
          line: fn.getStartLineNumber(),
          message: `${fn.getName() ?? "<anonymous>"} in ${relPath}:${fn.getStartLineNumber()} — ${issues.join("; ")}`,
          severity: "warning",
        });
      }
    }

    // Check class methods
    for (const cls of file.getClasses()) {
      for (const method of cls.getMethods()) {
        totalFunctions++;
        const hasReturnType = method.getReturnTypeNode() !== undefined;
        const untypedParams = method.getParameters().filter((p) => !p.getTypeNode() && !p.getInitializer());

        if (!hasReturnType || untypedParams.length > 0) {
          untypedCount++;
          const issues: string[] = [];
          if (!hasReturnType) { issues.push("no return type"); }
          if (untypedParams.length > 0) {
            issues.push(`${untypedParams.length} untyped param(s)`);
          }
          findings.push({
            file: relPath,
            line: method.getStartLineNumber(),
            message: `${cls.getName()}.${method.getName()} in ${relPath}:${method.getStartLineNumber()} — ${issues.join("; ")}`,
            severity: "warning",
          });
        }
      }
    }
  }

  const typedRatio = totalFunctions > 0 ? 1 - untypedCount / totalFunctions : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "3.2",
    score: typedRatio,
    findings: findings.slice(0, 30),
    summary: `${untypedCount} of ${totalFunctions} functions have untyped parameters or missing return types`,
  };
}

function analyzeTypeAssertions(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    let assertionCount = 0;

    file.forEachDescendant((node) => {
      // 'as' type assertions
      if (node.getKind() === SyntaxKind.AsExpression) {
        assertionCount++;
      }
      // non-null assertions (!)
      if (node.getKind() === SyntaxKind.NonNullExpression) {
        assertionCount++;
      }
    });

    if (assertionCount > thresholds.typeAssertionsPerFile.acceptable) {
      findings.push({
        file: relPath,
        message: `${relPath} has ${assertionCount} type assertions — consider proper typing`,
        severity: assertionCount > thresholds.typeAssertionsPerFile.bad ? "error" : "warning",
        value: assertionCount,
      });
    }

    if (assertionCount <= thresholds.typeAssertionsPerFile.good) {
      totalScore += 1;
    } else if (assertionCount <= thresholds.typeAssertionsPerFile.acceptable) {
      totalScore += 0.7;
    } else if (assertionCount <= thresholds.typeAssertionsPerFile.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = files.length > 0 ? totalScore / files.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "3.5",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} files with excessive type assertions`,
  };
}

function analyzeSchemaValidation(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const schemaLibraries = ["zod", "joi", "yup", "io-ts", "runtypes", "superstruct"];

  let filesWithSchemas = 0;
  // Check only non-test source files that look like they handle input (resources, routes, handlers)
  const inputFiles = files.filter((f) => {
    const fp = f.getFilePath().toLowerCase();
    return (
      fp.includes("resource") ||
      fp.includes("route") ||
      fp.includes("handler") ||
      fp.includes("controller") ||
      fp.includes("endpoint") ||
      fp.includes("schema")
    );
  });

  for (const file of inputFiles) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const imports = file.getImportDeclarations();
    const hasSchemaImport = imports.some((imp) =>
      schemaLibraries.some((lib) => imp.getModuleSpecifierValue().includes(lib))
    );

    if (hasSchemaImport) {
      filesWithSchemas++;
    }
  }

  const score = inputFiles.length > 0 ? filesWithSchemas / inputFiles.length : 1;

  if (inputFiles.length > 0 && score < 0.5) {
    findings.push({
      file: "",
      message: `Only ${filesWithSchemas} of ${inputFiles.length} input-handling files use schema validation libraries`,
      severity: "warning",
    });
  }

  return {
    id: "3.3",
    score,
    findings,
    summary: `${filesWithSchemas} of ${inputFiles.length} input-handling files use schema validation (${(score * 100).toFixed(0)}%)`,
  };
}
