/**
 * AI Insights DTOs
 * TASK-REPORTS-002: Reports API Module
 *
 * @module modules/reports/dto/ai-insights.dto
 * @description DTOs for AI insights request/response with Swagger documentation.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AIInsights,
  KeyFinding,
  TrendAnalysis,
  AnomalyDetection,
  Recommendation,
} from '../../../agents/report-synthesis';

/**
 * Request body for generating AI insights.
 */
export class InsightsRequestDto {
  @ApiProperty({
    description: 'Report data to analyze',
    example: {
      income: { totalCents: 15000000, breakdown: [] },
      expenses: { totalCents: 12000000, breakdown: [] },
      netProfitCents: 3000000,
    },
  })
  @IsObject()
  reportData!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Additional context for AI analysis',
    example: { businessContext: 'Small creche with 50 children' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

/**
 * Key finding from AI analysis.
 */
export class KeyFindingDto {
  @ApiProperty({
    description: 'Category of the finding',
    enum: [
      'revenue',
      'expense',
      'profitability',
      'cash_flow',
      'risk',
      'compliance',
    ],
    example: 'profitability',
  })
  category!: string;

  @ApiProperty({
    description: 'Human-readable description of the finding',
    example: 'The creche is profitable with a net profit of R30,000.',
  })
  finding!: string;

  @ApiProperty({
    description: 'Impact assessment',
    enum: ['positive', 'negative', 'neutral'],
    example: 'positive',
  })
  impact!: string;

  @ApiProperty({
    description: 'Severity level',
    enum: ['low', 'medium', 'high', 'critical'],
    example: 'low',
  })
  severity!: string;
}

/**
 * Trend analysis from AI.
 */
export class TrendAnalysisDto {
  @ApiProperty({
    description: 'Metric being analyzed',
    example: 'Total Revenue',
  })
  metric!: string;

  @ApiProperty({
    description: 'Direction of the trend',
    enum: ['increasing', 'decreasing', 'stable', 'volatile'],
    example: 'increasing',
  })
  direction!: string;

  @ApiProperty({
    description: 'Percentage change from comparison period',
    example: 7.14,
  })
  percentageChange!: number;

  @ApiProperty({
    description: 'Timeframe for the analysis',
    example: 'month-over-month',
  })
  timeframe!: string;

  @ApiProperty({
    description: 'Plain-English interpretation',
    example: 'Revenue has increased by 7.14% compared to last month.',
  })
  interpretation!: string;
}

/**
 * Anomaly detection from AI.
 */
export class AnomalyDetectionDto {
  @ApiProperty({
    description: 'Type of anomaly',
    enum: ['spike', 'drop', 'pattern_break', 'outlier'],
    example: 'spike',
  })
  type!: string;

  @ApiProperty({
    description: 'Description of the anomaly',
    example: 'Unusual increase in utility expenses this month.',
  })
  description!: string;

  @ApiProperty({
    description: 'Severity of the anomaly',
    enum: ['low', 'medium', 'high', 'critical'],
    example: 'medium',
  })
  severity!: string;

  @ApiProperty({
    description: 'Affected metric',
    example: 'Utility Expenses',
  })
  affectedMetric!: string;

  @ApiProperty({
    description: 'Expected value in cents',
    example: 500000,
  })
  expectedValue!: number;

  @ApiProperty({
    description: 'Actual value in cents',
    example: 750000,
  })
  actualValue!: number;

  @ApiProperty({
    description: 'Possible causes for the anomaly',
    type: [String],
    example: ['Seasonal increase', 'Rate adjustment', 'Billing error'],
  })
  possibleCauses!: string[];
}

/**
 * Recommendation from AI analysis.
 */
export class RecommendationDto {
  @ApiProperty({
    description: 'Priority level',
    enum: ['high', 'medium', 'low'],
    example: 'high',
  })
  priority!: string;

  @ApiProperty({
    description: 'Recommendation category',
    enum: [
      'cost_reduction',
      'revenue_growth',
      'risk_mitigation',
      'compliance',
      'efficiency',
      'cash_flow',
    ],
    example: 'cost_reduction',
  })
  category!: string;

  @ApiProperty({
    description: 'Specific action to take',
    example: 'Review all expenses and identify cost-cutting opportunities.',
  })
  action!: string;

  @ApiProperty({
    description: 'Expected impact of the action',
    example: 'Reduce monthly operating costs by 10-15%.',
  })
  expectedImpact!: string;

  @ApiProperty({
    description: 'Suggested timeline',
    example: 'immediate',
  })
  timeline!: string;
}

/**
 * AI insights data.
 */
export class AIInsightsDataDto {
  @ApiProperty({
    description: 'Executive summary (2-3 paragraphs)',
    example:
      'For the reporting period, the creche generated R150,000 in income against R120,000 in expenses...',
  })
  executiveSummary!: string;

  @ApiProperty({
    description: 'Key findings from the analysis',
    type: [KeyFindingDto],
  })
  keyFindings!: KeyFindingDto[];

  @ApiProperty({
    description: 'Trend analysis',
    type: [TrendAnalysisDto],
  })
  trends!: TrendAnalysisDto[];

  @ApiProperty({
    description: 'Detected anomalies',
    type: [AnomalyDetectionDto],
  })
  anomalies!: AnomalyDetectionDto[];

  @ApiProperty({
    description: 'Prioritized recommendations',
    type: [RecommendationDto],
  })
  recommendations!: RecommendationDto[];

  @ApiProperty({
    description: 'Overall confidence score (0-100)',
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  confidenceScore!: number;

  @ApiProperty({
    description: 'When insights were generated (ISO 8601)',
    example: '2025-01-29T12:00:00.000Z',
  })
  generatedAt!: string;
}

/**
 * AI insights response.
 */
export class AIInsightsResponseDto {
  @ApiProperty({
    description: 'Whether the insights were generated successfully',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'AI-generated insights data',
    type: AIInsightsDataDto,
  })
  data!: AIInsightsDataDto;

  @ApiProperty({
    description: 'Source of the insights',
    enum: ['SDK', 'FALLBACK'],
    example: 'SDK',
  })
  source!: 'SDK' | 'FALLBACK';

  @ApiPropertyOptional({
    description: 'AI model used (only present when source is SDK)',
    example: 'claude-3-sonnet-20240229',
  })
  model?: string;
}
