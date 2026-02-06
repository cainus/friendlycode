import { Project, SourceFile, SyntaxKind } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import * as path from "path";

export function analyzeConsistency(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeTestPatternConsistency(sourceFiles, rootPath),
  ];
}

type TestPattern = {
  usesBeforeEach: boolean;
  usesAfterEach: boolean;
  usesMocks: boolean;
  assertionStyle: "expect" | "assert" | "should" | "mixed";
  setupStyle: "inline" | "beforeEach" | "helper" | "mixed";
};

function analyzeTestPatternConsistency(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const testFiles = files.filter((f) => {
    const fp = f.getFilePath();
    return fp.includes(".test.") || fp.includes(".spec.") || fp.includes("__tests__");
  });

  if (testFiles.length === 0) {
    return {
      id: "1.5",
      score: 0.5, // neutral if no tests found
      findings: [{ file: "", message: "No test files found to analyze consistency", severity: "warning" }],
      summary: "No test files found",
    };
  }

  const patterns: TestPattern[] = [];

  for (const file of testFiles) {
    const text = file.getFullText();
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
    summary: `${inconsistencies} test pattern inconsistencies found across ${testFiles.length} test files`,
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
