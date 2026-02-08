export type Finding = {
  file: string;
  line?: number;
  message: string;
  severity: "info" | "warning" | "error";
  value?: number;
};

export type SubIssueResult = {
  id: string;
  score: number; // 0-1
  findings: Finding[];
  summary: string;
  excluded?: boolean; // true if evaluation failed — excluded from scoring
};

export type CategoryResult = {
  id: number;
  name: string;
  score: number; // 0-10
  subIssues: SubIssueResult[];
};

export type Report = {
  overallScore: number; // 0-100
  categories: CategoryResult[];
  recommendations: Recommendation[];
  metadata: ReportMetadata;
};

export type Recommendation = {
  priority: number; // 1 = highest
  category: string;
  subIssue: string;
  message: string;
  file?: string;
  line?: number;
  impact: number; // how many points could be gained
};

export type ReportMetadata = {
  analyzedPath: string;
  timestamp: string;
  totalFiles: number;
  totalLines: number;
  llmAnalysisIncluded: boolean;
  durationMs: number;
};

export type SubIssueDefinition = {
  id: string;
  categoryId: number;
  name: string;
  description: string;
  analysisType: "static" | "llm";
};

export type CategoryDefinition = {
  id: number;
  name: string;
  subIssues: SubIssueDefinition[];
};

export type AnalyzerContext = {
  rootPath: string;
  sourceFiles: string[];
  testFiles: string[];
  allFiles: string[];
};
