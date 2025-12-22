'use client';

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ValidationWarning {
  type: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
}

interface ValidationWarningsProps {
  warnings: ValidationWarning[];
  className?: string;
}

export function ValidationWarnings({ warnings, className }: ValidationWarningsProps) {
  if (warnings.length === 0) return null;

  const errors = warnings.filter((w) => w.type === 'error');
  const warningItems = warnings.filter((w) => w.type === 'warning');
  const infoItems = warnings.filter((w) => w.type === 'info');

  return (
    <div className={cn('space-y-3', className)}>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errors ({errors.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {errors.map((error, i) => (
                <li key={i}>
                  {error.field && <span className="font-medium">{error.field}: </span>}
                  {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {warningItems.length > 0 && (
        <Alert variant="default" className="border-yellow-500 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Warnings ({warningItems.length})</AlertTitle>
          <AlertDescription className="text-yellow-700">
            <ul className="list-disc list-inside space-y-1 mt-2">
              {warningItems.map((warning, i) => (
                <li key={i}>
                  {warning.field && <span className="font-medium">{warning.field}: </span>}
                  {warning.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {infoItems.length > 0 && (
        <Alert variant="default" className="border-blue-500 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Information</AlertTitle>
          <AlertDescription className="text-blue-700">
            <ul className="list-disc list-inside space-y-1 mt-2">
              {infoItems.map((info, i) => (
                <li key={i}>
                  {info.field && <span className="font-medium">{info.field}: </span>}
                  {info.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
