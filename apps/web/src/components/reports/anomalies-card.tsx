'use client';

/**
 * Anomalies Card Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/anomalies-card
 * @description Card displaying detected anomalies with warning styling.
 *
 * CRITICAL RULES:
 * - Warning/destructive styling based on severity
 * - Show possible causes
 * - All amounts in cents - divide by 100 for display
 */

import { AlertTriangle, TrendingUp, TrendingDown, AlertCircle, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import type { AnomalyDetection, Severity, AnomalyType } from '@/hooks/use-ai-insights';

interface AnomaliesCardProps {
  /** Detected anomalies from AI analysis */
  anomalies: AnomalyDetection[];
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Get icon for anomaly type.
 */
function getAnomalyIcon(type: AnomalyType) {
  switch (type) {
    case 'spike':
      return TrendingUp;
    case 'drop':
      return TrendingDown;
    case 'pattern_break':
      return Activity;
    case 'outlier':
    default:
      return AlertCircle;
  }
}

/**
 * Get badge variant based on severity.
 */
function getSeverityBadgeVariant(severity: Severity): 'default' | 'secondary' | 'warning' | 'destructive' {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'destructive';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'secondary';
  }
}

/**
 * Get background color class based on severity.
 */
function getSeverityBgClass(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'bg-destructive/10 border-destructive/30';
    case 'high':
      return 'bg-destructive/5 border-destructive/20';
    case 'medium':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'low':
    default:
      return 'bg-muted/50';
  }
}

/**
 * Individual anomaly item.
 */
function AnomalyItem({ anomaly }: { anomaly: AnomalyDetection }) {
  const Icon = getAnomalyIcon(anomaly.type);
  const badgeVariant = getSeverityBadgeVariant(anomaly.severity);
  const bgClass = getSeverityBgClass(anomaly.severity);

  // Calculate variance percentage
  const variance = anomaly.expectedValue !== 0
    ? ((anomaly.actualValue - anomaly.expectedValue) / anomaly.expectedValue) * 100
    : 0;

  return (
    <div className={cn('rounded-lg border p-4', bgClass)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Icon
            className={cn(
              'h-5 w-5',
              anomaly.severity === 'critical' || anomaly.severity === 'high'
                ? 'text-destructive'
                : anomaly.severity === 'medium'
                  ? 'text-yellow-600'
                  : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">{anomaly.affectedMetric}</span>
            <Badge variant={badgeVariant}>{anomaly.severity}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{anomaly.description}</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Expected:</span>{' '}
              <span className="font-medium">{formatCurrency(anomaly.expectedValue / 100)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Actual:</span>{' '}
              <span className="font-medium">{formatCurrency(anomaly.actualValue / 100)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Variance:</span>{' '}
              <span
                className={cn(
                  'font-medium',
                  variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : ''
                )}
              >
                {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
              </span>
            </div>
          </div>
          {anomaly.possibleCauses.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Possible causes:</span>
              <ul className="mt-1 list-disc list-inside text-muted-foreground">
                {anomaly.possibleCauses.map((cause, index) => (
                  <li key={index}>{cause}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Card displaying detected anomalies.
 *
 * @example
 * {insights?.anomalies && insights.anomalies.length > 0 && (
 *   <AnomaliesCard anomalies={insights.anomalies} />
 * )}
 */
export function AnomaliesCard({ anomalies, className }: AnomaliesCardProps) {
  // Sort anomalies by severity (critical first)
  const sortedAnomalies = [...anomalies].sort((a, b) => {
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const criticalCount = anomalies.filter(a => a.severity === 'critical' || a.severity === 'high').length;

  return (
    <Card className={cn(criticalCount > 0 && 'border-destructive/50', className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={cn(
              'h-5 w-5',
              criticalCount > 0 ? 'text-destructive' : 'text-yellow-600'
            )}
            aria-hidden="true"
          />
          <CardTitle>Anomalies Detected</CardTitle>
          <Badge variant={criticalCount > 0 ? 'destructive' : 'warning'}>
            {anomalies.length}
          </Badge>
        </div>
        <CardDescription>
          Unusual patterns or values detected in your financial data that may require attention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedAnomalies.map((anomaly, index) => (
          <AnomalyItem key={index} anomaly={anomaly} />
        ))}
      </CardContent>
    </Card>
  );
}
