import { SubIssueResult, CategoryResult, Recommendation } from "./analyzers/types";
import { categories } from "./config";

export function aggregateScores(subIssueResults: SubIssueResult[]): {
  categories: CategoryResult[];
  overallScore: number;
  recommendations: Recommendation[];
} {
  const resultMap = new Map<string, SubIssueResult>();
  for (const r of subIssueResults) {
    resultMap.set(r.id, r);
  }

  const categoryResults: CategoryResult[] = [];

  for (const cat of categories) {
    const subIssues: SubIssueResult[] = [];

    for (const si of cat.subIssues) {
      const result = resultMap.get(si.id) ?? {
        id: si.id,
        score: 0,
        excluded: true,
        findings: [],
        summary: "Not evaluated",
      };
      subIssues.push(result);
    }

    // Only score sub-issues that were actually evaluated
    const evaluated = subIssues.filter((si) => !si.excluded);
    let categoryScore: number;
    if (evaluated.length > 0) {
      const pointsPerSubIssue = 10 / evaluated.length;
      categoryScore = evaluated.reduce((sum, si) => sum + si.score * pointsPerSubIssue, 0);
    } else {
      categoryScore = 0;
    }

    categoryResults.push({
      id: cat.id,
      name: cat.name,
      score: Math.round(categoryScore * 100) / 100,
      subIssues,
    });
  }

  const overallScore = Math.round(categoryResults.reduce((sum, c) => sum + c.score, 0) * 100) / 100;

  const recommendations = generateRecommendations(categoryResults);

  return { categories: categoryResults, overallScore, recommendations };
}

function generateRecommendations(categoryResults: CategoryResult[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const cat of categoryResults) {
    const evaluated = cat.subIssues.filter((si) => !si.excluded);
    for (const si of evaluated) {
      if (si.score >= 0.8) { continue; } // Good enough, skip

      const potentialGain = (1 - si.score) * (10 / evaluated.length);

      // Generate recommendations from findings
      if (si.findings.length > 0) {
        // Use the top finding as the recommendation
        const topFinding = si.findings[0]!;
        recommendations.push({
          priority: 0, // Will be sorted later
          category: cat.name,
          subIssue: getSubIssueName(si.id),
          message: topFinding.message,
          file: topFinding.file || undefined,
          line: topFinding.line,
          impact: Math.round(potentialGain * 100) / 100,
        });
      } else {
        recommendations.push({
          priority: 0,
          category: cat.name,
          subIssue: getSubIssueName(si.id),
          message: si.summary,
          impact: Math.round(potentialGain * 100) / 100,
        });
      }
    }
  }

  // Sort by impact (points that could be gained)
  recommendations.sort((a, b) => b.impact - a.impact);

  // Assign priority numbers
  recommendations.forEach((r, i) => {
    r.priority = i + 1;
  });

  return recommendations.slice(0, 30);
}

function getSubIssueName(id: string): string {
  for (const cat of categories) {
    for (const si of cat.subIssues) {
      if (si.id === id) { return si.name; }
    }
  }
  return id;
}
