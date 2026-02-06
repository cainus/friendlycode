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
  .option("--skip-llm", "Skip LLM-based analysis (static analysis only)", false)
  .option("--output-dir <dir>", "Output directory for reports", ".")
  .action(async (targetPath: string, options: { skipLlm: boolean; outputDir: string }) => {
    try {
      await scan({
        targetPath,
        skipLlm: options.skipLlm,
        outputDir: options.outputDir,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
