import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface CompletionStepProps {
  onComplete: () => void;
  isSaving: boolean;
}

export function CompletionStep({ onComplete, isSaving }: CompletionStepProps) {
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold">Onboarding Complete!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Thank you for completing your profile. You will receive a welcome pack via email
          with all the information you need to get started.
        </p>
        <div className="pt-4">
          <Button onClick={onComplete} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Go to Dashboard'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
