'use client';

import { CheckCircle, Trophy, Sparkles, GraduationCap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type MilestoneType =
  | 'first_correction'
  | 'fifty_corrections'
  | 'high_accuracy'
  | 'learning_complete';

export interface AccuracyMilestoneProps {
  milestone: MilestoneType;
  onDismiss: () => void;
}

interface MilestoneConfig {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  iconColor: string;
}

const MILESTONE_CONFIG: Record<MilestoneType, MilestoneConfig> = {
  first_correction: {
    icon: Sparkles,
    title: 'First Correction Made!',
    description:
      "Great start! You've made your first correction. Each edit helps our AI learn your preferences and improve accuracy.",
    color: 'bg-blue-50 dark:bg-blue-950/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  fifty_corrections: {
    icon: Trophy,
    title: '50 Corrections Milestone!',
    description:
      "Excellent progress! You've made 50 corrections. The AI is getting much smarter about your transaction patterns.",
    color: 'bg-purple-50 dark:bg-purple-950/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  high_accuracy: {
    icon: CheckCircle,
    title: '95% Accuracy Achieved!',
    description:
      "Outstanding! You've reached 95% accuracy. The AI is now highly reliable for auto-categorizing your transactions.",
    color: 'bg-green-50 dark:bg-green-950/20',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  learning_complete: {
    icon: GraduationCap,
    title: 'Learning Mode Complete!',
    description:
      "Congratulations! You've completed the learning phase. The AI has learned your patterns and is ready for full automation.",
    color: 'bg-amber-50 dark:bg-amber-950/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
};

/**
 * Accuracy Milestone Celebration Modal
 * TASK-TRANS-023: Learning Mode Indicator
 *
 * Celebrates key milestones:
 * - First correction
 * - 50 corrections
 * - 95% accuracy
 * - Learning mode completion
 */
export function AccuracyMilestone({ milestone, onDismiss }: AccuracyMilestoneProps) {
  const config = MILESTONE_CONFIG[milestone];
  const Icon = config.icon;

  return (
    <Dialog open onOpenChange={onDismiss}>
      <DialogContent className={`sm:max-w-md ${config.color}`}>
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white dark:bg-gray-900">
            <Icon className={`h-12 w-12 ${config.iconColor}`} />
          </div>
          <DialogTitle className="text-center text-2xl">
            {config.title}
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 flex justify-center">
          <Button onClick={onDismiss} className="w-full sm:w-auto">
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
