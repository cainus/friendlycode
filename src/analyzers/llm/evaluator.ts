import Anthropic from "@anthropic-ai/sdk";
import { SubIssueResult, Finding } from "../types";
import { categories } from "../../config";
import { SampledFile } from "./sampler";

const LLM_SUB_ISSUES = categories
  .flatMap((cat) =>
    cat.subIssues
      .filter((si) => si.analysisType === "llm")
      .map((si) => ({ ...si, categoryName: cat.name }))
  );

type LlmScoreResponse = {
  subIssueId: string;
  score: number;
  findings: { file: string; message: string; severity: "info" | "warning" | "error" }[];
  summary: string;
};

export async function evaluateWithLlm(
  sampledFiles: SampledFile[],
  onProgress?: (message: string) => void
): Promise<SubIssueResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    onProgress?.("No ANTHROPIC_API_KEY set — skipping LLM evaluation");
    return LLM_SUB_ISSUES.map((si) => ({
      id: si.id,
      score: 0.5, // neutral default
      findings: [{ file: "", message: "LLM evaluation skipped (no API key)", severity: "info" as const }],
      summary: "Skipped — no ANTHROPIC_API_KEY",
    }));
  }

  const client = new Anthropic({ apiKey });

  // Prepare file summaries for the prompt
  const fileContext = sampledFiles
    .map((f) => `--- ${f.relativePath} (${f.lineCount} lines, sampled because: ${f.reason}) ---\n${truncateContent(f.content, 3000)}`)
    .join("\n\n");

  // Batch sub-issues into groups to minimize API calls
  const batchSize = 8;
  const results: SubIssueResult[] = [];

  for (let i = 0; i < LLM_SUB_ISSUES.length; i += batchSize) {
    const batch = LLM_SUB_ISSUES.slice(i, i + batchSize);
    onProgress?.(`Evaluating LLM sub-issues ${i + 1}-${Math.min(i + batchSize, LLM_SUB_ISSUES.length)} of ${LLM_SUB_ISSUES.length}...`);

    const batchResults = await evaluateBatch(client, batch, fileContext);
    results.push(...batchResults);
  }

  return results;
}

async function evaluateBatch(
  client: Anthropic,
  subIssues: typeof LLM_SUB_ISSUES,
  fileContext: string
): Promise<SubIssueResult[]> {
  const rubricItems = subIssues
    .map((si) => `- ${si.id} "${si.name}" (Category: ${si.categoryName}): ${si.description}`)
    .join("\n");

  const prompt = `You are evaluating a TypeScript codebase for LLM-readability. Below are sampled source files from the codebase, followed by rubric items to evaluate.

For each rubric item, provide:
1. A score from 0.0 to 1.0 (0 = very poor, 1 = excellent)
2. Specific findings with file references
3. A one-sentence summary

## Sampled Files

${fileContext}

## Rubric Items to Evaluate

${rubricItems}

Respond with a JSON array of objects, one per rubric item, in this exact format:
[
  {
    "subIssueId": "X.Y",
    "score": 0.75,
    "findings": [
      {"file": "path/to/file.ts", "message": "description of finding", "severity": "warning"}
    ],
    "summary": "One sentence summary"
  }
]

Be specific and reference actual file names from the sampled files. Be fair but honest — most real codebases score between 0.3 and 0.8 on most items.
Return ONLY the JSON array, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse the JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in LLM response");
    }

    const parsed: LlmScoreResponse[] = JSON.parse(jsonMatch[0]);

    return parsed.map((item) => ({
      id: item.subIssueId,
      score: Math.max(0, Math.min(1, item.score)),
      findings: item.findings.map((f) => ({ ...f, severity: f.severity ?? "info" })),
      summary: item.summary,
    }));
  } catch (error) {
    // On failure, return neutral scores
    return subIssues.map((si) => ({
      id: si.id,
      score: 0.5,
      findings: [{ file: "", message: `LLM evaluation failed: ${error instanceof Error ? error.message : "unknown error"}`, severity: "warning" as const }],
      summary: "LLM evaluation encountered an error",
    }));
  }
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) { return content; }
  return content.substring(0, maxChars) + "\n... (truncated)";
}
