import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  className,
}: FeatureCardProps) {
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
        <div
          className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
