import { Quote } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  company?: string;
  className?: string;
}

export function TestimonialCard({
  quote,
  author,
  role,
  company,
  className,
}: TestimonialCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-6">
        <Quote
          className="absolute right-4 top-4 h-8 w-8 text-primary/10"
          aria-hidden="true"
        />
        <blockquote className="relative">
          <p className="text-base text-foreground italic leading-relaxed">
            &ldquo;{quote}&rdquo;
          </p>
        </blockquote>
        <footer className="mt-6">
          <div className="flex items-center gap-4">
            {/* Avatar placeholder */}
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold"
              aria-hidden="true"
            >
              {author
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <cite className="not-italic">
                <span className="font-semibold text-foreground">{author}</span>
              </cite>
              <p className="text-sm text-muted-foreground">
                {role}
                {company && <span> at {company}</span>}
              </p>
            </div>
          </div>
        </footer>
      </CardContent>
    </Card>
  );
}
