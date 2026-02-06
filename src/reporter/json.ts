import { Report } from "../analyzers/types";
import * as fs from "fs";
import * as path from "path";

export function writeJsonReport(report: Report, outputDir: string): string {
  const filePath = path.join(outputDir, "friendlycode-report.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}
