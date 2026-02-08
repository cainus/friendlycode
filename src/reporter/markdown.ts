import { Report, CategoryResult, Recommendation } from "../analyzers/types";
import * as fs from "fs";
import * as path from "path";

export function writeMarkdownReport(report: Report, outputDir: string): string {
  const filePath = path.join(outputDir, "friendlycode-report.md");
  fs.mkdirSync(outputDir, { recursive: true });

  const lines: string[] = [];

  // Header
  lines.push("# FriendlyCode Report");
  lines.push("");
  lines.push(`**Overall Score: ${report.overallScore} / 100**`);
  lines.push("");
  lines.push(`- Analyzed: \`${report.metadata.analyzedPath}\``);
  lines.push(`- Date: ${report.metadata.timestamp}`);
  lines.push(`- Files: ${report.metadata.totalFiles} (${report.metadata.totalLines.toLocaleString()} lines)`);
  lines.push(`- LLM Analysis: Yes`);
  lines.push(`- Duration: ${(report.metadata.durationMs / 1000).toFixed(1)}s`);
  lines.push("");

  // Score bar visualization
  lines.push("## Score Overview");
  lines.push("");
  lines.push(renderScoreBar(report.overallScore, 100));
  lines.push("");

  // Category breakdown
  lines.push("## Category Breakdown");
  lines.push("");
  lines.push("| # | Category | Score | Bar |");
  lines.push("|---|----------|-------|-----|");

  for (const cat of report.categories) {
    lines.push(`| ${cat.id} | ${cat.name} | ${cat.score.toFixed(1)}/10 | ${renderScoreBar(cat.score, 10)} |`);
  }
  lines.push("");

  // Detailed category scores
  lines.push("## Detailed Scores");
  lines.push("");

  for (const cat of report.categories) {
    lines.push(`### ${cat.id}. ${cat.name} — ${cat.score.toFixed(1)}/10`);
    lines.push("");
    lines.push("| Sub-Issue | Score | Summary |");
    lines.push("|-----------|-------|---------|");

    for (const si of cat.subIssues) {
      const emoji = si.score >= 0.8 ? "+" : si.score >= 0.5 ? "~" : "-";
      lines.push(`| ${si.id} ${emoji} | ${(si.score * 100).toFixed(0)}% | ${si.summary} |`);
    }
    lines.push("");
  }

  // Top recommendations
  lines.push("## Top Recommendations");
  lines.push("");
  lines.push("Ranked by potential impact (points that could be gained):");
  lines.push("");

  for (const rec of report.recommendations.slice(0, 20)) {
    const fileRef = rec.file ? ` (\`${rec.file}${rec.line ? `:${rec.line}` : ""}\`)` : "";
    lines.push(`${rec.priority}. **[${rec.category} / ${rec.subIssue}]** ${rec.message}${fileRef}`);
    lines.push(`   *Impact: up to +${rec.impact.toFixed(2)} points*`);
    lines.push("");
  }

  // Worst offender files
  lines.push("## Files With Most Findings");
  lines.push("");
  const fileFindingCounts = new Map<string, number>();
  for (const cat of report.categories) {
    for (const si of cat.subIssues) {
      for (const finding of si.findings) {
        if (finding.file) {
          fileFindingCounts.set(finding.file, (fileFindingCounts.get(finding.file) ?? 0) + 1);
        }
      }
    }
  }

  const sortedFiles = Array.from(fileFindingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sortedFiles.length > 0) {
    lines.push("| File | Findings |");
    lines.push("|------|----------|");
    for (const [file, count] of sortedFiles) {
      lines.push(`| \`${file}\` | ${count} |`);
    }
  }
  lines.push("");

  const content = lines.join("\n");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function renderScoreBar(score: number, max: number): string {
  const pct = score / max;
  const filled = Math.round(pct * 20);
  const empty = 20 - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const pctStr = `${(pct * 100).toFixed(0)}%`;
  return `\`${bar}\` ${pctStr}`;
}
