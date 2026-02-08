import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
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

const JSON_SCHEMA = JSON.stringify({
  type: "array",
  items: {
    type: "object",
    properties: {
      subIssueId: { type: "string" },
      score: { type: "number" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            message: { type: "string" },
            severity: { type: "string", enum: ["info", "warning", "error"] },
          },
          required: ["file", "message", "severity"],
        },
      },
      summary: { type: "string" },
    },
    required: ["subIssueId", "score", "findings", "summary"],
  },
});

const SAFETY_SYSTEM_PROMPT = `SAFETY CONSTRAINTS - You MUST follow these rules:
- NEVER modify, create, or delete any files
- NEVER run any git commands
- NEVER use Bash or any shell commands
- You are ONLY analyzing code snippets and returning JSON scores
- Return ONLY the JSON array, no other text`;

export async function evaluateWithLlm(
  sampledFiles: SampledFile[],
  provider: "api" | "cli" = "api",
  onProgress?: (message: string) => void
): Promise<SubIssueResult[]> {
  if (provider === "cli") {
    return evaluateWithCli(sampledFiles, onProgress);
  }
  return evaluateWithApi(sampledFiles, onProgress);
}

async function evaluateWithApi(
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

    const batchResults = await evaluateApiBatch(client, batch, fileContext);
    results.push(...batchResults);
  }

  return results;
}

async function evaluateWithCli(
  sampledFiles: SampledFile[],
  onProgress?: (message: string) => void
): Promise<SubIssueResult[]> {
  // Prepare file summaries for the prompt
  const fileContext = sampledFiles
    .map((f) => `--- ${f.relativePath} (${f.lineCount} lines, sampled because: ${f.reason}) ---\n${truncateContent(f.content, 3000)}`)
    .join("\n\n");

  // Batch sub-issues into groups to minimize CLI calls
  const batchSize = 8;
  const results: SubIssueResult[] = [];

  for (let i = 0; i < LLM_SUB_ISSUES.length; i += batchSize) {
    const batch = LLM_SUB_ISSUES.slice(i, i + batchSize);
    onProgress?.(`Evaluating LLM sub-issues ${i + 1}-${Math.min(i + batchSize, LLM_SUB_ISSUES.length)} of ${LLM_SUB_ISSUES.length} (Claude CLI)...`);

    const batchResults = await evaluateCliBatch(batch, fileContext);
    results.push(...batchResults);
  }

  return results;
}

async function evaluateApiBatch(
  client: Anthropic,
  subIssues: typeof LLM_SUB_ISSUES,
  fileContext: string
): Promise<SubIssueResult[]> {
  const prompt = buildPrompt(subIssues, fileContext);

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

    return parseResponse(text, subIssues);
  } catch (error) {
    return fallbackResults(subIssues, error);
  }
}

async function evaluateCliBatch(
  subIssues: typeof LLM_SUB_ISSUES,
  fileContext: string
): Promise<SubIssueResult[]> {
  const prompt = buildPrompt(subIssues, fileContext);

  try {
    const text = await runClaude(prompt);
    return parseResponse(text, subIssues);
  } catch (error) {
    return fallbackResults(subIssues, error);
  }
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--dangerously-skip-permissions",
      "--output-format", "json",
      "--model", "claude-sonnet-4-5-20250929",
    ];

    const child = execFile("claude", args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 180_000, // 3 minutes
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`claude CLI failed: ${error.message}${stderr ? `\nstderr: ${stderr}` : ""}`));
        return;
      }

      try {
        // --output-format json wraps the response in a JSON object with a "result" field
        const outer = JSON.parse(stdout);
        const resultText = typeof outer.result === "string" ? outer.result : JSON.stringify(outer.result);
        resolve(resultText);
      } catch {
        // If it's not wrapped JSON, use stdout directly
        resolve(stdout);
      }
    });

    // Pipe prompt via stdin to avoid ARG_MAX limits
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

function buildPrompt(
  subIssues: typeof LLM_SUB_ISSUES,
  fileContext: string
): string {
  const rubricItems = subIssues
    .map((si) => `- ${si.id} "${si.name}" (Category: ${si.categoryName}): ${si.description}`)
    .join("\n");

  return `You are evaluating a TypeScript codebase for LLM-readability. Below are sampled source files from the codebase, followed by rubric items to evaluate.

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
}

function parseResponse(
  text: string,
  subIssues: typeof LLM_SUB_ISSUES
): SubIssueResult[] {
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
}

function fallbackResults(
  subIssues: typeof LLM_SUB_ISSUES,
  error: unknown
): SubIssueResult[] {
  return subIssues.map((si) => ({
    id: si.id,
    score: 0,
    excluded: true,
    findings: [{ file: "", message: `LLM evaluation failed: ${error instanceof Error ? error.message : "unknown error"}`, severity: "warning" as const }],
    summary: "LLM evaluation failed — excluded from score",
  }));
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) { return content; }
  return content.substring(0, maxChars) + "\n... (truncated)";
}
