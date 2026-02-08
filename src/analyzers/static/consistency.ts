import { Project, SourceFile, SyntaxKind } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import * as path from "path";
import * as fs from "fs";

function findTestFiles(dir: string): string[] {
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
      results.push(...findTestFiles(fullPath));
    } else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function analyzeConsistency(project: Project, rootPath: string): SubIssueResult[] {
  return [
    analyzeTestPatternConsistency(rootPath),
  ];
}

type TestPattern = {
  usesBeforeEach: boolean;
  usesAfterEach: boolean;
  usesMocks: boolean;
  assertionStyle: "expect" | "assert" | "should" | "mixed";
  setupStyle: "inline" | "beforeEach" | "helper" | "mixed";
};

function analyzeTestPatternConsistency(rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const testFilePaths = findTestFiles(rootPath);

  if (testFilePaths.length === 0) {
    return {
      id: "1.5",
      score: 0.5, // neutral if no tests found
      findings: [{ file: "", message: "No test files found to analyze consistency", severity: "warning" }],
      summary: "No test files found",
    };
  }

  const patterns: TestPattern[] = [];

  for (const filePath of testFilePaths) {
    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const pattern: TestPattern = {
      usesBeforeEach: /\bbeforeEach\b/.test(text),
      usesAfterEach: /\bafterEach\b/.test(text),
      usesMocks: /\b(mock|stub|spy|sinon|jest\.fn|vi\.fn)\b/i.test(text),
      assertionStyle: detectAssertionStyle(text),
      setupStyle: detectSetupStyle(text),
    };
    patterns.push(pattern);
  }

  // Check for consistency across test files
  let inconsistencies = 0;

  // Assertion style consistency
  const assertionStyles = new Set(patterns.map((p) => p.assertionStyle));
  if (assertionStyles.size > 1) {
    inconsistencies++;
    findings.push({
      file: "",
      message: `Mixed assertion styles: ${Array.from(assertionStyles).join(", ")}`,
      severity: "warning",
    });
  }

  // Setup style consistency
  const setupStyles = new Set(patterns.map((p) => p.setupStyle));
  if (setupStyles.size > 2) {
    inconsistencies++;
    findings.push({
      file: "",
      message: `Mixed test setup styles: ${Array.from(setupStyles).join(", ")}`,
      severity: "warning",
    });
  }

  // Mock usage consistency
  const mockUsers = patterns.filter((p) => p.usesMocks).length;
  const mockRatio = mockUsers / patterns.length;
  if (mockRatio > 0.2 && mockRatio < 0.8) {
    inconsistencies++;
    findings.push({
      file: "",
      message: `Inconsistent mock usage: ${mockUsers} of ${patterns.length} test files use mocks`,
      severity: "info",
    });
  }

  const maxInconsistencies = 3;
  const score = Math.max(0, 1 - inconsistencies / maxInconsistencies);

  return {
    id: "1.5",
    score,
    findings,
    summary: `${inconsistencies} test pattern inconsistencies found across ${testFilePaths.length} test files`,
  };
}

function detectAssertionStyle(text: string): "expect" | "assert" | "should" | "mixed" {
  const hasExpect = /\bexpect\(/.test(text);
  const hasAssert = /\bassert[\.(]/.test(text);
  const hasShould = /\.should[\.(]/.test(text);

  const styles = [hasExpect, hasAssert, hasShould].filter(Boolean).length;
  if (styles > 1) { return "mixed"; }
  if (hasExpect) { return "expect"; }
  if (hasAssert) { return "assert"; }
  if (hasShould) { return "should"; }
  return "expect"; // default
}

function detectSetupStyle(text: string): "inline" | "beforeEach" | "helper" | "mixed" {
  const hasBeforeEach = /\bbeforeEach\b/.test(text);
  const hasHelperSetup = /\b(setup|createFixture|buildContext|factory)\b/i.test(text);
  const styles = [hasBeforeEach, hasHelperSetup].filter(Boolean).length;

  if (styles > 1) { return "mixed"; }
  if (hasBeforeEach) { return "beforeEach"; }
  if (hasHelperSetup) { return "helper"; }
  return "inline";
}
