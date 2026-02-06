import { Project, SourceFile } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import * as path from "path";

export function analyzeTestMetrics(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeTestColocation(sourceFiles, rootPath),
    analyzeTestExistenceRatio(sourceFiles, rootPath),
    analyzeTestDescriptionQuality(sourceFiles, rootPath),
  ];
}

function analyzeTestColocation(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  const sourceFiles = files.filter((f) => {
    const fp = f.getFilePath();
    return !fp.includes(".test.") && !fp.includes(".spec.") && !fp.includes("__tests__") && !fp.includes("node_modules");
  });

  const testFiles = files.filter((f) => {
    const fp = f.getFilePath();
    return fp.includes(".test.") || fp.includes(".spec.");
  });

  const testFileSet = new Set(testFiles.map((f) => path.relative(rootPath, f.getFilePath())));
  let colocatedCount = 0;
  let checkedCount = 0;

  for (const file of sourceFiles) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const dir = path.dirname(relPath);
    const baseName = path.basename(relPath, path.extname(relPath));
    const ext = path.extname(relPath);

    // Skip files that aren't likely to need tests
    if (baseName === "index" || baseName === "types" || relPath.includes("__")) {
      continue;
    }

    checkedCount++;

    // Check for colocated test
    const possibleTestNames = [
      path.join(dir, `${baseName}.test${ext}`),
      path.join(dir, `${baseName}.spec${ext}`),
      path.join(dir, "__tests__", `${baseName}.test${ext}`),
      path.join(dir, "__tests__", `${baseName}.spec${ext}`),
    ];

    const isColocated = possibleTestNames.some((t) => testFileSet.has(t));
    if (isColocated) {
      colocatedCount++;
    }
  }

  const score = checkedCount > 0 ? colocatedCount / checkedCount : 1;

  if (score < 0.5) {
    findings.push({
      file: "",
      message: `Only ${colocatedCount} of ${checkedCount} source files have colocated test files`,
      severity: "warning",
    });
  }

  return {
    id: "4.3",
    score,
    findings,
    summary: `${colocatedCount} of ${checkedCount} source files have colocated tests (${(score * 100).toFixed(0)}%)`,
  };
}

function analyzeTestExistenceRatio(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  const sourceFiles = files.filter((f) => {
    const fp = f.getFilePath();
    return !fp.includes(".test.") && !fp.includes(".spec.") && !fp.includes("__tests__") && !fp.includes("node_modules") && !fp.includes(".d.ts");
  });

  const testFileNames = new Set<string>();
  for (const file of files) {
    const fp = file.getFilePath();
    if (fp.includes(".test.") || fp.includes(".spec.")) {
      const baseName = path.basename(fp).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, "").toLowerCase();
      testFileNames.add(baseName);
    }
  }

  let withTests = 0;
  const missingTests: string[] = [];

  for (const file of sourceFiles) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const baseName = path.basename(relPath, path.extname(relPath)).toLowerCase();

    // Skip files unlikely to need tests
    if (baseName === "index" || baseName === "types" || baseName.startsWith("__")) {
      continue;
    }

    if (testFileNames.has(baseName)) {
      withTests++;
    } else {
      missingTests.push(relPath);
    }
  }

  const totalTestable = withTests + missingTests.length;
  const score = totalTestable > 0 ? withTests / totalTestable : 1;

  // Report the files without tests (up to 20)
  for (const f of missingTests.slice(0, 20)) {
    findings.push({
      file: f,
      message: `${f} has no corresponding test file`,
      severity: "info",
    });
  }

  return {
    id: "9.2",
    score,
    findings,
    summary: `${withTests} of ${totalTestable} source files have corresponding test files (${(score * 100).toFixed(0)}%)`,
  };
}

function analyzeTestDescriptionQuality(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const testFiles = files.filter((f) => {
    const fp = f.getFilePath();
    return fp.includes(".test.") || fp.includes(".spec.");
  });

  let goodDescriptions = 0;
  let poorDescriptions = 0;

  for (const file of testFiles) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const text = file.getFullText();

    // Find it() and describe() strings
    const itPattern = /\bit\(\s*["'`](.*?)["'`]/g;
    const describePattern = /\bdescribe\(\s*["'`](.*?)["'`]/g;

    let match;
    while ((match = itPattern.exec(text)) !== null) {
      const desc = match[1] ?? "";
      if (desc.length >= 20 && /\bshould\b|\bwhen\b|\breturns?\b|\bthrows?\b|\bcreates?\b|\bvalidates?\b/i.test(desc)) {
        goodDescriptions++;
      } else if (desc.length < 10 || /^(works|test|it|does|basic|simple)$/i.test(desc.trim())) {
        poorDescriptions++;
        if (findings.length < 20) {
          findings.push({
            file: relPath,
            message: `Poor test description in ${relPath}: "${desc}"`,
            severity: "info",
          });
        }
      } else {
        goodDescriptions++; // Medium quality is OK
      }
    }
  }

  const total = goodDescriptions + poorDescriptions;
  const score = total > 0 ? goodDescriptions / total : 0.5;

  return {
    id: "9.5",
    score,
    findings,
    summary: `${goodDescriptions} of ${total} test descriptions are descriptive (${total > 0 ? (score * 100).toFixed(0) : "N/A"}%)`,
  };
}

function analyzeDocumentation(rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const fs = require("fs");

  const docFiles = ["README.md", "CLAUDE.md", ".claude/README.md", "docs/README.md", "CONTRIBUTING.md"];
  let foundDocs = 0;
  let totalDocLength = 0;

  for (const docFile of docFiles) {
    const fullPath = path.join(rootPath, docFile);
    if (fs.existsSync(fullPath)) {
      foundDocs++;
      const content = fs.readFileSync(fullPath, "utf-8");
      totalDocLength += content.length;
    }
  }

  if (foundDocs === 0) {
    findings.push({
      file: "",
      message: "No README.md or CLAUDE.md found — add architectural documentation for LLM agents",
      severity: "error",
    });
  } else if (totalDocLength < 500) {
    findings.push({
      file: "",
      message: `Documentation files found (${foundDocs}) but total content is only ${totalDocLength} chars — consider expanding`,
      severity: "warning",
    });
  }

  const score = Math.min(1, (foundDocs * 0.3) + Math.min(0.7, totalDocLength / 5000));

  return {
    id: "8.1",
    score,
    findings,
    summary: `${foundDocs} documentation files found with ${totalDocLength} total characters`,
  };
}

// Export the documentation analyzer separately since it doesn't need ts-morph
export { analyzeDocumentation };
