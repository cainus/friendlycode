import { Project, SourceFile } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import { thresholds } from "../../config";
import * as path from "path";

export function analyzeFileMetrics(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeFileLength(sourceFiles, rootPath),
    analyzeExportsPerFile(sourceFiles, rootPath),
    analyzeDirectoryDepth(sourceFiles, rootPath),
  ];
}

function analyzeFileLength(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const file of files) {
    const lineCount = file.getEndLineNumber();
    const relPath = path.relative(rootPath, file.getFilePath());

    if (lineCount > thresholds.fileLength.acceptable) {
      findings.push({
        file: relPath,
        message: `${relPath} is ${lineCount} lines — consider breaking it up`,
        severity: lineCount > thresholds.fileLength.bad ? "error" : "warning",
        value: lineCount,
      });
    }

    if (lineCount <= thresholds.fileLength.good) {
      totalScore += 1;
    } else if (lineCount <= thresholds.fileLength.acceptable) {
      totalScore += 0.7;
    } else if (lineCount <= thresholds.fileLength.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = files.length > 0 ? totalScore / files.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "4.4",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} of ${files.length} files exceed ${thresholds.fileLength.acceptable} lines`,
  };
}

function analyzeExportsPerFile(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const file of files) {
    const exportCount = file.getExportedDeclarations().size;
    const relPath = path.relative(rootPath, file.getFilePath());

    if (exportCount > thresholds.exportsPerFile.acceptable) {
      findings.push({
        file: relPath,
        message: `${relPath} has ${exportCount} exports — consider splitting into separate modules`,
        severity: exportCount > thresholds.exportsPerFile.bad ? "error" : "warning",
        value: exportCount,
      });
    }

    if (exportCount <= thresholds.exportsPerFile.good) {
      totalScore += 1;
    } else if (exportCount <= thresholds.exportsPerFile.acceptable) {
      totalScore += 0.7;
    } else if (exportCount <= thresholds.exportsPerFile.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = files.length > 0 ? totalScore / files.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "4.6",
    score,
    findings: findings.slice(0, 30),
    summary: `${findings.length} of ${files.length} files have more than ${thresholds.exportsPerFile.acceptable} exports`,
  };
}

function analyzeDirectoryDepth(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let totalScore = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const depth = relPath.split(path.sep).length - 1; // subtract filename

    if (depth > thresholds.directoryDepth.acceptable) {
      findings.push({
        file: relPath,
        message: `${relPath} is nested ${depth} levels deep`,
        severity: depth > thresholds.directoryDepth.bad ? "error" : "warning",
        value: depth,
      });
    }

    if (depth <= thresholds.directoryDepth.good) {
      totalScore += 1;
    } else if (depth <= thresholds.directoryDepth.acceptable) {
      totalScore += 0.7;
    } else if (depth <= thresholds.directoryDepth.bad) {
      totalScore += 0.3;
    } else {
      totalScore += 0;
    }
  }

  const score = files.length > 0 ? totalScore / files.length : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "4.5",
    score,
    findings: findings.slice(0, 20),
    summary: `${findings.length} files nested deeper than ${thresholds.directoryDepth.acceptable} levels`,
  };
}
