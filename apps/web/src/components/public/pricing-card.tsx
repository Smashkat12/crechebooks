import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

interface CtaButton {
  text: string;
  href: string;
}

interface PricingCardProps {
  tier: string;
  price: string;
  period?: string;
  features: string[];
  cta: CtaButton;
  highlighted?: boolean;
  className?: string;
}

export function PricingCard({
  tier,
  price,
  period = '/month',
  features,
  cta,
  highlighted = false,
  className,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        'relative flex flex-col transition-all',
        highlighted
          ? 'border-primary shadow-lg ring-2 ring-primary'
          : 'hover:shadow-md',
        className
      )}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
            Most Popular
          </span>
        </div>
      )}
      <CardHeader className="text-center">
        <h3 className="text-lg font-semibold text-foreground">{tier}</h3>
        <div className="mt-4">
          <span className="text-4xl font-bold text-foreground">{price}</span>
          {price !== 'Free' && price !== 'Custom' && (
            <span className="text-muted-foreground">{period}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3" role="list" aria-label={`${tier} features`}>
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check
                className="h-5 w-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          asChild
          className="w-full"
          variant={highlighted ? 'default' : 'outline'}
          size="lg"
        >
          <Link href={cta.href}>{cta.text}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
