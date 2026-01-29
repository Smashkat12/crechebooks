'use client';

/**
 * Recommendations Card Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/recommendations-card
 * @description Card displaying AI recommendations sorted by priority.
 *
 * CRITICAL RULES:
 * - Sort by priority (high > medium > low)
 * - Show category and timeline
 * - Clear action items
 */

import {
  Lightbulb,
  ArrowRight,
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  Scale,
  Zap,
  Banknote,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Recommendation, RecommendationPriority, RecommendationCategory } from '@/hooks/use-ai-insights';

interface RecommendationsCardProps {
  /** Recommendations from AI analysis */
  recommendations: Recommendation[];
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Get icon for recommendation category.
 */
function getCategoryIcon(category: RecommendationCategory) {
  switch (category) {
    case 'cost_reduction':
      return TrendingDown;
    case 'revenue_growth':
      return TrendingUp;
    case 'risk_mitigation':
      return Shield;
    case 'compliance':
      return Scale;
    case 'efficiency':
      return Zap;
    case 'cash_flow':
      return Banknote;
    default:
      return Lightbulb;
  }
}

/**
 * Get badge variant based on priority.
 */
function getPriorityBadgeVariant(priority: RecommendationPriority): 'default' | 'secondary' | 'destructive' {
  switch (priority) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
    default:
      return 'secondary';
  }
}

/**
 * Get border color class based on priority.
 */
function getPriorityBorderClass(priority: RecommendationPriority): string {
  switch (priority) {
    case 'high':
      return 'border-l-destructive';
    case 'medium':
      return 'border-l-primary';
    case 'low':
    default:
      return 'border-l-muted-foreground';
  }
}

/**
 * Format category name for display.
 */
function formatCategory(category: RecommendationCategory): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Individual recommendation item.
 */
function RecommendationItem({ recommendation }: { recommendation: Recommendation }) {
  const Icon = getCategoryIcon(recommendation.category);
  const badgeVariant = getPriorityBadgeVariant(recommendation.priority);
  const borderClass = getPriorityBorderClass(recommendation.priority);

  return (
    <div className={cn('rounded-lg border border-l-4 p-4', borderClass)}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">
              {formatCategory(recommendation.category)}
            </span>
          </div>
          <Badge variant={badgeVariant}>
            {recommendation.priority} priority
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">{recommendation.action}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span>{recommendation.expectedImpact}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{recommendation.timeline}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Card displaying AI recommendations.
 *
 * @example
 * {insights?.recommendations && insights.recommendations.length > 0 && (
 *   <RecommendationsCard recommendations={insights.recommendations} />
 * )}
 */
export function RecommendationsCard({ recommendations, className }: RecommendationsCardProps) {
  // Sort recommendations by priority (high first)
  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityOrder: Record<RecommendationPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const highPriorityCount = recommendations.filter(r => r.priority === 'high').length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-600" aria-hidden="true" />
          <CardTitle>Recommendations</CardTitle>
          <Badge variant="secondary">
            {recommendations.length}
          </Badge>
          {highPriorityCount > 0 && (
            <Badge variant="destructive">
              {highPriorityCount} high priority
            </Badge>
          )}
        </div>
        <CardDescription>
          AI-generated action items to improve your financial performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedRecommendations.map((recommendation, index) => (
          <RecommendationItem key={index} recommendation={recommendation} />
        ))}
      </CardContent>
    </Card>
  );
}
