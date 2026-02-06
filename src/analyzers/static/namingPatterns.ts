import { Project, SourceFile, Node, SyntaxKind } from "ts-morph";
import { SubIssueResult, Finding } from "../types";
import { thresholds } from "../../config";
import * as path from "path";

export function analyzeNamingPatterns(project: Project, rootPath: string): SubIssueResult[] {
  const sourceFiles = project.getSourceFiles();

  return [
    analyzeNamingConsistency(sourceFiles, rootPath),
    analyzeNameUniqueness(sourceFiles, rootPath),
    analyzeBooleanPrefixes(sourceFiles, rootPath),
    analyzeFunctionVerbPrefixes(sourceFiles, rootPath),
    analyzeShortIdentifiers(sourceFiles, rootPath),
    analyzeFileNameMatchesExport(sourceFiles, rootPath),
  ];
}

function analyzeNamingConsistency(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];

  // Check for casing consistency in exported identifiers
  let camelCaseCount = 0;
  let pascalCaseCount = 0;
  let snakeCaseCount = 0;
  let totalIdentifiers = 0;

  for (const file of files) {
    for (const [name] of file.getExportedDeclarations()) {
      if (name === "default") { continue; }
      totalIdentifiers++;
      if (/^[a-z][a-zA-Z0-9]*$/.test(name)) { camelCaseCount++; }
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) { pascalCaseCount++; }
      else if (/^[a-z][a-z0-9_]*$/.test(name)) { snakeCaseCount++; }
    }
  }

  // The dominant convention should cover most identifiers
  const maxConvention = Math.max(camelCaseCount, pascalCaseCount, snakeCaseCount);
  // Types/classes use PascalCase, functions/vars use camelCase — both are fine
  const consistentCount = camelCaseCount + pascalCaseCount;
  const score = totalIdentifiers > 0 ? Math.min(1, consistentCount / totalIdentifiers) : 1;

  if (snakeCaseCount > totalIdentifiers * 0.1) {
    findings.push({
      file: "",
      message: `Mixed naming conventions: ${camelCaseCount} camelCase, ${pascalCaseCount} PascalCase, ${snakeCaseCount} snake_case`,
      severity: "warning",
    });
  }

  return {
    id: "1.3",
    score,
    findings,
    summary: `Naming: ${camelCaseCount} camelCase, ${pascalCaseCount} PascalCase, ${snakeCaseCount} snake_case out of ${totalIdentifiers}`,
  };
}

function analyzeNameUniqueness(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  const nameOccurrences = new Map<string, string[]>();

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    for (const [name] of file.getExportedDeclarations()) {
      if (name === "default") { continue; }
      const existing = nameOccurrences.get(name) ?? [];
      existing.push(relPath);
      nameOccurrences.set(name, existing);
    }
  }

  let duplicateCount = 0;
  let totalNames = nameOccurrences.size;

  for (const [name, occurrences] of nameOccurrences) {
    if (occurrences.length > 3) {
      duplicateCount++;
      findings.push({
        file: "",
        message: `'${name}' is exported from ${occurrences.length} files — may cause confusion when searching`,
        severity: occurrences.length > 5 ? "warning" : "info",
        value: occurrences.length,
      });
    }
  }

  const score = totalNames > 0 ? Math.max(0, 1 - duplicateCount / totalNames * 3) : 1;
  findings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    id: "7.2",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${duplicateCount} exported names appear in more than 3 files`,
  };
}

function analyzeBooleanPrefixes(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let boolWithPrefix = 0;
  let boolWithoutPrefix = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());

    file.forEachDescendant((node) => {
      if (Node.isVariableDeclaration(node)) {
        const typeText = node.getType().getText();
        if (typeText === "boolean" || typeText === "true" || typeText === "false") {
          const name = node.getName();
          const hasPrefix = thresholds.booleanPrefixes.some((p) => name.startsWith(p) && name.length > p.length && name[p.length]! === name[p.length]!.toUpperCase());
          if (hasPrefix) {
            boolWithPrefix++;
          } else {
            boolWithoutPrefix++;
            if (boolWithoutPrefix <= 30) {
              findings.push({
                file: relPath,
                line: node.getStartLineNumber(),
                message: `Boolean '${name}' in ${relPath}:${node.getStartLineNumber()} — consider is/has/should/can prefix`,
                severity: "info",
              });
            }
          }
        }
      }
    });
  }

  const total = boolWithPrefix + boolWithoutPrefix;
  const score = total > 0 ? boolWithPrefix / total : 1;

  return {
    id: "7.3",
    score,
    findings: findings.slice(0, 20),
    summary: `${boolWithPrefix} of ${total} boolean variables use is/has/should/can prefix (${total > 0 ? (score * 100).toFixed(0) : 100}%)`,
  };
}

function analyzeFunctionVerbPrefixes(files: SourceFile[], rootPath: string): SubIssueResult {
  let withVerb = 0;
  let withoutVerb = 0;
  const findings: Finding[] = [];

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());

    for (const fn of file.getFunctions()) {
      const name = fn.getName();
      if (!name) { continue; }
      if (thresholds.functionVerbPrefixes.some((v) => name.startsWith(v) && name.length > v.length)) {
        withVerb++;
      } else {
        withoutVerb++;
        if (findings.length < 30) {
          findings.push({
            file: relPath,
            line: fn.getStartLineNumber(),
            message: `Function '${name}' in ${relPath}:${fn.getStartLineNumber()} — consider a verb prefix (get/create/validate/etc.)`,
            severity: "info",
          });
        }
      }
    }
  }

  const total = withVerb + withoutVerb;
  const score = total > 0 ? withVerb / total : 1;

  return {
    id: "7.4",
    score,
    findings: findings.slice(0, 20),
    summary: `${withVerb} of ${total} functions use verb prefixes (${total > 0 ? (score * 100).toFixed(0) : 100}%)`,
  };
}

function analyzeShortIdentifiers(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let shortCount = 0;
  let totalCount = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());

    for (const [name] of file.getExportedDeclarations()) {
      if (name === "default") { continue; }
      totalCount++;

      // Split camelCase and check individual words for abbreviations
      const words = name.replace(/([A-Z])/g, " $1").trim().split(/\s+/);
      const abbreviations = words.filter((w) => {
        const lower = w.toLowerCase();
        return lower.length <= 2 && !thresholds.commonAbbreviations.has(lower);
      });

      if (abbreviations.length > 0 || name.length < thresholds.identifierMinLength) {
        shortCount++;
        if (findings.length < 30) {
          findings.push({
            file: relPath,
            message: `'${name}' in ${relPath} — short/abbreviated identifier`,
            severity: "info",
          });
        }
      }
    }
  }

  const score = totalCount > 0 ? Math.max(0, 1 - shortCount / totalCount * 2) : 1;

  return {
    id: "7.5",
    score: Math.max(0, Math.min(1, score)),
    findings: findings.slice(0, 20),
    summary: `${shortCount} of ${totalCount} exported identifiers use short or abbreviated names`,
  };
}

function analyzeFileNameMatchesExport(files: SourceFile[], rootPath: string): SubIssueResult {
  const findings: Finding[] = [];
  let matches = 0;
  let totalChecked = 0;

  for (const file of files) {
    const relPath = path.relative(rootPath, file.getFilePath());
    const fileName = path.basename(relPath, path.extname(relPath));

    // Skip index files and test files
    if (fileName === "index" || relPath.includes(".test.") || relPath.includes(".spec.")) {
      continue;
    }

    const exported = file.getExportedDeclarations();
    if (exported.size === 0) { continue; }

    totalChecked++;

    // Check if any exported name matches the file name
    let hasMatch = false;
    for (const [name] of exported) {
      if (name.toLowerCase() === fileName.toLowerCase()) {
        hasMatch = true;
        break;
      }
    }

    if (hasMatch) {
      matches++;
    } else if (exported.size <= 3) {
      // Only flag files with few exports — grab-bag files are a different issue
      const exportNames = Array.from(exported.keys()).filter((n) => n !== "default").slice(0, 3);
      findings.push({
        file: relPath,
        message: `${relPath} exports [${exportNames.join(", ")}] but file name is '${fileName}'`,
        severity: "info",
      });
    }
  }

  const score = totalChecked > 0 ? matches / totalChecked : 1;

  return {
    id: "7.7",
    score,
    findings: findings.slice(0, 20),
    summary: `${matches} of ${totalChecked} files have a name matching their primary export (${totalChecked > 0 ? (score * 100).toFixed(0) : 100}%)`,
  };
}
