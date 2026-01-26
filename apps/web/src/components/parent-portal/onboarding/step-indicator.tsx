import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepConfig, Step } from '@/hooks/parent-portal/use-parent-onboarding';

interface StepIndicatorProps {
  steps: StepConfig[];
  currentStep: Step;
}

export function StepIndicator({ steps: stepList, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center mb-8">
      {stepList.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isPast =
          stepList.findIndex((s) => s.id === currentStep) > index ||
          currentStep === 'complete';

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
                isActive && 'border-primary bg-primary text-primary-foreground',
                isPast && !isActive && 'border-green-500 bg-green-500 text-white',
                !isActive && !isPast && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {isPast && !isActive ? (
                <Check className="h-5 w-5" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </div>
            {index < stepList.length - 1 && (
              <div
                className={cn(
                  'w-16 h-0.5 mx-2',
                  isPast ? 'bg-green-500' : 'bg-muted-foreground/30'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
