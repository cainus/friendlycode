import { Project, SourceFile } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

export type SampledFile = {
  relativePath: string;
  absolutePath: string;
  content: string;
  lineCount: number;
  reason: string;
};

export function sampleFiles(project: Project, rootPath: string, maxFiles: number = 15): SampledFile[] {
  const sourceFiles = project.getSourceFiles();
  const candidates = new Map<string, { file: SourceFile; score: number; reasons: string[] }>();

  // Score each file by importance
  for (const file of sourceFiles) {
    const fp = file.getFilePath();
    const relPath = path.relative(rootPath, fp);

    // Skip test files, declaration files, and node_modules
    if (relPath.includes("node_modules") || relPath.includes(".d.ts")) {
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    // Size: larger files are more representative and more important to assess
    const lineCount = file.getEndLineNumber();
    if (lineCount > 300) {
      score += 3;
      reasons.push("large file");
    } else if (lineCount > 100) {
      score += 1;
      reasons.push("medium file");
    }

    // Import count: heavily imported files are important
    const importedBy = countImportedBy(file, sourceFiles);
    if (importedBy > 10) {
      score += 3;
      reasons.push(`imported by ${importedBy} files`);
    } else if (importedBy > 5) {
      score += 2;
      reasons.push(`imported by ${importedBy} files`);
    }

    // File type significance
    const fpLower = fp.toLowerCase();
    if (fpLower.includes("resource") || fpLower.includes("route") || fpLower.includes("handler")) {
      score += 2;
      reasons.push("endpoint/handler file");
    }
    if (fpLower.includes("model")) {
      score += 2;
      reasons.push("model file");
    }
    if (fpLower.includes("middleware")) {
      score += 1;
      reasons.push("middleware");
    }
    if (fpLower.includes("config") || fpLower.includes("constant")) {
      score += 1;
      reasons.push("config file");
    }

    // Test files get some representation too
    if (relPath.includes(".test.") || relPath.includes(".spec.")) {
      score += 1;
      reasons.push("test file");
    }

    if (score > 0) {
      candidates.set(relPath, { file, score, reasons });
    }
  }

  // Also try to include recently changed files
  try {
    const recentFiles = getRecentlyChangedFiles(rootPath);
    for (const rf of recentFiles) {
      const existing = candidates.get(rf);
      if (existing) {
        existing.score += 2;
        existing.reasons.push("recently changed");
      }
    }
  } catch {
    // Not a git repo or git not available
  }

  // Sort by score and take top N
  const sorted = Array.from(candidates.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, maxFiles);

  // Ensure diversity: include at least one from different categories
  const result: SampledFile[] = [];
  for (const [relPath, { file, reasons }] of sorted) {
    const content = file.getFullText();
    result.push({
      relativePath: relPath,
      absolutePath: file.getFilePath(),
      content,
      lineCount: file.getEndLineNumber(),
      reason: reasons.join(", "),
    });
  }

  return result;
}

function countImportedBy(file: SourceFile, allFiles: SourceFile[]): number {
  const fp = file.getFilePath();
  let count = 0;

  for (const other of allFiles) {
    if (other === file) { continue; }
    for (const imp of other.getImportDeclarations()) {
      const resolved = imp.getModuleSpecifierSourceFile();
      if (resolved && resolved.getFilePath() === fp) {
        count++;
        break;
      }
    }
  }

  return count;
}

function getRecentlyChangedFiles(rootPath: string): string[] {
  try {
    const output = execSync("git log --oneline --name-only -20 --pretty=format:", {
      cwd: rootPath,
      encoding: "utf-8",
      timeout: 5000,
    });
    const files = output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && (l.endsWith(".ts") || l.endsWith(".tsx")));
    return [...new Set(files)].slice(0, 20);
  } catch {
    return [];
  }
}
