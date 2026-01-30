/**
 * AI Insights Fetching Hook
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module hooks/use-ai-insights
 * @description Hook for fetching AI-generated insights with caching.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS - errors must propagate
 * - Longer cache time (10 min) - AI generation is expensive
 * - Report data must exist before fetching insights
 */

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient } from '@/lib/api/client';
import { ReportType } from '@crechebooks/types';
import type { ReportDataResponse } from './use-report-data';

/**
 * Severity levels for findings and anomalies.
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Impact assessment for findings.
 */
export type Impact = 'positive' | 'negative' | 'neutral';

/**
 * Trend direction.
 */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'volatile';

/**
 * Anomaly types.
 */
export type AnomalyType = 'spike' | 'drop' | 'pattern_break' | 'outlier';

/**
 * Recommendation priority.
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

/**
 * Finding categories.
 */
export type FindingCategory =
  | 'revenue'
  | 'expense'
  | 'profitability'
  | 'cash_flow'
  | 'risk'
  | 'compliance';

/**
 * Recommendation categories.
 */
export type RecommendationCategory =
  | 'cost_reduction'
  | 'revenue_growth'
  | 'risk_mitigation'
  | 'compliance'
  | 'efficiency'
  | 'cash_flow';

/**
 * Key finding from AI analysis.
 */
export interface KeyFinding {
  category: FindingCategory;
  finding: string;
  impact: Impact;
  severity: Severity;
}

/**
 * Trend analysis from AI.
 */
export interface TrendAnalysis {
  metric: string;
  direction: TrendDirection;
  percentageChange: number;
  timeframe: string;
  interpretation: string;
}

/**
 * Anomaly detection from AI.
 */
export interface AnomalyDetection {
  type: AnomalyType;
  description: string;
  severity: Severity;
  affectedMetric: string;
  expectedValue: number;
  actualValue: number;
  possibleCauses: string[];
}

/**
 * Recommendation from AI analysis.
 */
export interface Recommendation {
  priority: RecommendationPriority;
  category: RecommendationCategory;
  action: string;
  expectedImpact: string;
  timeline: string;
}

/**
 * AI-generated insights response.
 */
export interface AIInsights {
  executiveSummary: string;
  keyFindings: KeyFinding[];
  trends: TrendAnalysis[];
  anomalies: AnomalyDetection[];
  recommendations: Recommendation[];
  confidenceScore: number;
  generatedAt: string;
  source: 'SDK' | 'FALLBACK';
  model?: string;
}

/**
 * API response wrapper for insights.
 */
interface AIInsightsAPIResponse {
  success: boolean;
  data: AIInsights;
  source: 'SDK' | 'FALLBACK';
  model?: string;
}

/**
 * Query key factory for AI insights.
 */
export const aiInsightsQueryKeys = {
  all: ['ai-insights'] as const,
  insights: (type: ReportType | undefined, generatedAt: string | undefined) =>
    [...aiInsightsQueryKeys.all, type, generatedAt] as const,
};

/**
 * Hook for fetching AI-generated insights.
 *
 * @param type - Report type
 * @param reportData - Report data to analyze (must exist before fetching insights)
 * @returns TanStack Query result with AI insights
 *
 * @example
 * const { data: insights, isLoading } = useAIInsights(
 *   ReportType.INCOME_STATEMENT,
 *   reportData
 * );
 */
export function useAIInsights(
  type: ReportType | undefined,
  reportData: ReportDataResponse | null | undefined
) {
  return useQuery<AIInsights | null, AxiosError>({
    queryKey: aiInsightsQueryKeys.insights(type, reportData?.generatedAt),
    queryFn: async () => {
      // Return null if required params are missing
      if (!type || !reportData) {
        return null;
      }

      const { data } = await apiClient.post<AIInsightsAPIResponse>(
        `/reports/${type}/insights`,
        { reportData }
      );

      // Merge source and model into the insights data
      return {
        ...data.data,
        source: data.source,
        model: data.model,
      };
    },
    enabled: !!type && !!reportData,
    staleTime: 10 * 60 * 1000, // 10 minutes - AI insights are expensive to generate
    retry: 1, // Only retry once - AI generation can fail and we don't want to hammer the API
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}
