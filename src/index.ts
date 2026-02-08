#!/usr/bin/env node

import { Command } from "commander";
import { scan } from "./scanner";

const program = new Command();

program
  .name("friendlycode")
  .description("Codebase LLM-readability scorer — evaluates how easily an LLM can work with your codebase")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze a TypeScript codebase for LLM readability")
  .argument("<path>", "Path to the codebase root")
  .option("--llm-provider <provider>", "LLM provider to use: 'api' (default, requires ANTHROPIC_API_KEY) or 'cli' (uses local claude CLI)", "api")
  .option("--output-dir <dir>", "Output directory for reports", ".")
  .action(async (targetPath: string, options: { llmProvider: string; outputDir: string }) => {
    try {
      if (options.llmProvider !== "api" && options.llmProvider !== "cli") {
        throw new Error(`Invalid --llm-provider value: "${options.llmProvider}". Must be "api" or "cli".`);
      }
      await scan({
        targetPath,
        llmProvider: options.llmProvider,
        outputDir: options.outputDir,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
