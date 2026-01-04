'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { queryKeys } from '@/lib/api/query-keys';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export interface LearningModeProgress {
  isLearningMode: boolean;
  daysRemaining: number;
  correctionsCount: number;
  correctionsTarget: number;
  progressPercent: number;
  currentAccuracy: number;
  excludeFromMetrics: boolean;
  daysSinceStart: number;
  firstTransactionDate: string | null;
}

const DISMISS_KEY = 'learning-mode-dismissed';

/**
 * Hook for managing learning mode state
 * TASK-TRANS-023: Learning Mode Indicator
 */
export function useLearningMode() {
  const [isDismissed, setIsDismissed] = useState(false);

  // Load dismissed state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    setIsDismissed(dismissed === 'true');
  }, []);

  // Fetch learning mode progress
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard.learningMode(),
    queryFn: async () => {
      const response = await apiClient.get<LearningModeProgress>(
        endpoints.dashboard.learningMode
      );
      return response.data;
    },
    refetchInterval: 300000, // Refresh every 5 minutes
    refetchOnWindowFocus: true,
  });

  // Dismiss indicator (stored in localStorage)
  const dismissIndicator = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setIsDismissed(true);
  };

  // Clear dismiss if learning mode status changes
  useEffect(() => {
    if (data && !data.isLearningMode && isDismissed) {
      localStorage.removeItem(DISMISS_KEY);
      setIsDismissed(false);
    }
  }, [data, isDismissed]);

  return {
    progress: data ?? null,
    isLoading,
    error: error as Error | null,
    dismissIndicator,
    isDismissed,
  };
}
