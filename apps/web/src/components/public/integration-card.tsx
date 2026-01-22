import * as React from 'react';
import { Check, ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface IntegrationCardProps {
  name: string;
  description: string;
  logo?: React.ReactNode;
  features: string[];
  className?: string;
}

export function IntegrationCard({
  name,
  description,
  logo,
  features,
  className,
}: IntegrationCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all hover:shadow-lg',
        className
      )}
    >
      {/* Hover gradient effect */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {logo ? (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted"
              aria-hidden="true"
            >
              {logo}
            </div>
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10"
              aria-hidden="true"
            >
              <ExternalLink className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2" role="list" aria-label={`${name} features`}>
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
