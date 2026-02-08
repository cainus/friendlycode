import { Report, CategoryResult, Recommendation } from "../analyzers/types";
import * as fs from "fs";
import * as path from "path";

export function writeHtmlReport(report: Report, outputDir: string): string {
  const filePath = path.join(outputDir, "friendlycode-report.html");
  fs.mkdirSync(outputDir, { recursive: true });

  const html = buildHtml(report);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

// --- Helpers ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.7) return "#22c55e";
  if (pct >= 0.4) return "#eab308";
  return "#ef4444";
}

// --- Section Builders ---

function buildScoreRing(score: number): string {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 100;
  const offset = circumference * (1 - pct);
  const color = scoreColor(score, 100);

  return `
    <svg width="140" height="140" viewBox="0 0 140 140" class="score-ring">
      <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#334155" stroke-width="12"/>
      <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${color}" stroke-width="12"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 70 70)"/>
      <text x="70" y="70" text-anchor="middle" dominant-baseline="central"
        fill="${color}" font-size="32" font-weight="bold">${score}</text>
    </svg>`;
}

function buildHeader(report: Report): string {
  return `
  <header class="header">
    <div class="header-text">
      <h1>FriendlyCode Report</h1>
      <p class="subtitle">LLM-Readability Score</p>
    </div>
    <div class="header-score">
      ${buildScoreRing(report.overallScore)}
      <span class="score-label">/ 100</span>
    </div>
  </header>`;
}

function buildMetadata(report: Report): string {
  const m = report.metadata;
  const duration = (m.durationMs / 1000).toFixed(1);
  const cards = [
    { label: "Path", value: escapeHtml(m.analyzedPath) },
    { label: "Date", value: escapeHtml(m.timestamp.split("T")[0] ?? m.timestamp) },
    { label: "Files", value: `${m.totalFiles} (${m.totalLines.toLocaleString()} lines)` },
    { label: "LLM Analysis", value: "Yes" },
    { label: "Duration", value: `${duration}s` },
  ];

  const items = cards
    .map(
      (c) => `
    <div class="meta-card">
      <div class="meta-label">${c.label}</div>
      <div class="meta-value">${c.value}</div>
    </div>`
    )
    .join("");

  return `<section class="meta-row">${items}</section>`;
}

function buildCategoryCards(report: Report): string {
  const cards = report.categories
    .map((cat) => {
      const color = scoreColor(cat.score, 10);
      const pct = ((cat.score / 10) * 100).toFixed(0);
      return `
      <div class="cat-card">
        <div class="cat-name">${escapeHtml(cat.name)}</div>
        <div class="cat-score" style="color:${color}">${cat.score.toFixed(1)}<span class="cat-max">/10</span></div>
        <div class="cat-bar-bg">
          <div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
    })
    .join("");

  return `
  <section>
    <h2>Category Breakdown</h2>
    <div class="cat-grid">${cards}</div>
  </section>`;
}

function buildDetailedScores(report: Report): string {
  const sections = report.categories
    .map((cat, idx) => {
      const rows = cat.subIssues
        .map((si) => {
          const pct = (si.score * 100).toFixed(0);
          const color = scoreColor(si.score, 1);
          return `
          <tr>
            <td>${escapeHtml(si.id)}</td>
            <td style="color:${color}">${pct}%</td>
            <td>${escapeHtml(si.summary)}</td>
          </tr>`;
        })
        .join("");

      return `
      <div class="detail-section">
        <button class="detail-toggle" onclick="this.parentElement.classList.toggle('open')">
          <span class="toggle-icon">&#9654;</span>
          <span class="detail-title">${cat.id}. ${escapeHtml(cat.name)}</span>
          <span class="detail-score" style="color:${scoreColor(cat.score, 10)}">${cat.score.toFixed(1)}/10</span>
        </button>
        <div class="detail-body">
          <table class="detail-table">
            <thead><tr><th>Sub-Issue</th><th>Score</th><th>Summary</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join("");

  return `
  <section>
    <h2>Detailed Scores</h2>
    ${sections}
  </section>`;
}

function buildRecommendations(report: Report): string {
  const items = report.recommendations
    .slice(0, 20)
    .map((rec) => {
      const fileRef = rec.file
        ? ` <span class="file-ref">${escapeHtml(rec.file)}${rec.line ? `:${rec.line}` : ""}</span>`
        : "";
      return `
      <li>
        <span class="rec-badge">${escapeHtml(rec.category)}</span>
        <span class="rec-sub">${escapeHtml(rec.subIssue)}</span>
        <span class="rec-msg">${escapeHtml(rec.message)}</span>
        ${fileRef}
        <span class="rec-impact">+${rec.impact.toFixed(2)} pts</span>
      </li>`;
    })
    .join("");

  return `
  <section>
    <h2>Top Recommendations</h2>
    <ol class="rec-list">${items}</ol>
  </section>`;
}

function buildFileFindings(report: Report): string {
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

  const sorted = Array.from(fileFindingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sorted.length === 0) return "";

  const rows = sorted
    .map(
      ([file, count]) => `
      <tr>
        <td class="file-cell">${escapeHtml(file)}</td>
        <td class="count-cell">${count}</td>
      </tr>`
    )
    .join("");

  return `
  <section>
    <h2>Files With Most Findings</h2>
    <table class="files-table">
      <thead><tr><th>File</th><th>Findings</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// --- Main builder ---

function buildHtml(report: Report): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FriendlyCode Report — ${report.overallScore}/100</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a; color: #e2e8f0; line-height: 1.6; padding: 2rem;
  }
  .container { max-width: 1100px; margin: 0 auto; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
  .header-text h1 { font-size: 1.8rem; color: #f8fafc; }
  .subtitle { color: #94a3b8; font-size: 1rem; }
  .header-score { display: flex; align-items: center; gap: 0.5rem; }
  .score-label { color: #64748b; font-size: 1.1rem; }

  /* Metadata */
  .meta-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .meta-card {
    background: #1e293b; border-radius: 8px; padding: 0.75rem 1rem; flex: 1 1 150px; min-width: 140px;
  }
  .meta-label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-value { color: #e2e8f0; font-size: 0.9rem; word-break: break-all; }

  /* Section headings */
  h2 { font-size: 1.25rem; color: #f1f5f9; margin-bottom: 1rem; margin-top: 2rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }

  /* Category grid */
  .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .cat-card { background: #1e293b; border-radius: 8px; padding: 1rem; }
  .cat-name { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.25rem; }
  .cat-score { font-size: 1.5rem; font-weight: bold; }
  .cat-max { font-size: 0.85rem; color: #64748b; }
  .cat-bar-bg { height: 6px; background: #334155; border-radius: 3px; margin-top: 0.5rem; }
  .cat-bar-fill { height: 6px; border-radius: 3px; transition: width 0.3s; }

  /* Detail sections */
  .detail-section { background: #1e293b; border-radius: 8px; margin-bottom: 0.5rem; overflow: hidden; }
  .detail-toggle {
    display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 1rem;
    background: none; border: none; color: #e2e8f0; cursor: pointer; font-size: 0.95rem; text-align: left;
  }
  .detail-toggle:hover { background: #263348; }
  .toggle-icon { font-size: 0.7rem; color: #64748b; transition: transform 0.2s; display: inline-block; }
  .detail-section.open .toggle-icon { transform: rotate(90deg); }
  .detail-title { flex: 1; }
  .detail-score { font-weight: bold; }
  .detail-body { display: none; padding: 0 1rem 1rem; }
  .detail-section.open .detail-body { display: block; }
  .detail-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .detail-table th { text-align: left; color: #64748b; padding: 0.4rem 0.5rem; border-bottom: 1px solid #334155; }
  .detail-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #1e293b; }
  .detail-table tr:last-child td { border-bottom: none; }

  /* Recommendations */
  .rec-list { list-style: decimal; padding-left: 1.5rem; }
  .rec-list li { margin-bottom: 0.75rem; font-size: 0.9rem; }
  .rec-badge {
    display: inline-block; background: #334155; color: #93c5fd; border-radius: 4px;
    padding: 0.1rem 0.4rem; font-size: 0.75rem; margin-right: 0.25rem;
  }
  .rec-sub { color: #64748b; font-size: 0.8rem; margin-right: 0.5rem; }
  .rec-msg { color: #e2e8f0; }
  .file-ref { color: #818cf8; font-family: monospace; font-size: 0.8rem; margin-left: 0.25rem; }
  .rec-impact { color: #22c55e; font-size: 0.8rem; margin-left: 0.5rem; white-space: nowrap; }

  /* File findings table */
  .files-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  .files-table th { text-align: left; color: #64748b; padding: 0.5rem; border-bottom: 1px solid #334155; }
  .files-table td { padding: 0.5rem; border-bottom: 1px solid #1e293b; }
  .file-cell { font-family: monospace; color: #818cf8; word-break: break-all; }
  .count-cell { text-align: right; width: 80px; }

  /* Footer */
  .footer { text-align: center; color: #475569; font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #1e293b; }
</style>
</head>
<body>
<div class="container">
${buildHeader(report)}
${buildMetadata(report)}
${buildCategoryCards(report)}
${buildDetailedScores(report)}
${buildRecommendations(report)}
${buildFileFindings(report)}
<footer class="footer">Generated by FriendlyCode</footer>
</div>
</body>
</html>`;
}
