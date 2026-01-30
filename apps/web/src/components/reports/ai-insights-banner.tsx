'use client';

/**
 * AI Insights Banner Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/ai-insights-banner
 * @description Banner displaying AI-generated executive summary with confidence badge.
 *
 * CRITICAL RULES:
 * - Expand/collapse for long summaries
 * - Show confidence score
 * - Show source (SDK vs FALLBACK)
 */

import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AIInsights } from '@/hooks/use-ai-insights';

interface AIInsightsBannerProps {
  /** AI-generated insights */
  insights: AIInsights;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Loading skeleton for AI insights banner.
 */
export function AIInsightsBannerSkeleton() {
  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Skeleton className="h-5 w-5 rounded-full" />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </Alert>
  );
}

/**
 * Get badge variant based on confidence score.
 */
function getConfidenceBadgeVariant(score: number): 'default' | 'secondary' | 'warning' {
  if (score >= 80) return 'default';
  if (score >= 60) return 'secondary';
  return 'warning';
}

/**
 * Banner displaying AI-generated executive summary.
 *
 * @example
 * <AIInsightsBanner insights={aiInsights} />
 */
export function AIInsightsBanner({ insights, className }: AIInsightsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  // Determine if summary is long enough to warrant expand/collapse
  const isLongSummary = insights.executiveSummary.length > 300;

  const confidenceVariant = getConfidenceBadgeVariant(insights.confidenceScore);

  return (
    <Alert className={cn('border-primary/30 bg-primary/5', className)}>
      <Bot className="h-5 w-5" aria-hidden="true" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          AI-Generated Insights
        </span>
        <Badge variant={confidenceVariant}>
          {insights.confidenceScore}% confidence
        </Badge>
        <Badge variant="outline" className="ml-auto">
          {insights.source === 'SDK' ? 'Claude Powered' : 'Rule-based'}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-3">
        <p
          className={cn(
            'text-sm leading-relaxed whitespace-pre-wrap',
            !expanded && isLongSummary && 'line-clamp-3'
          )}
        >
          {insights.executiveSummary}
        </p>
        {isLongSummary && (
          <Button
            variant="link"
            size="sm"
            className="px-0 h-auto mt-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" aria-hidden="true" />
                Read more
              </>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
