import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CtaButton {
  text: string;
  href: string;
}

interface CtaSectionProps {
  title: string;
  description: string;
  primaryCta: CtaButton;
  secondaryCta?: CtaButton;
  className?: string;
}

export function CtaSection({
  title,
  description,
  primaryCta,
  secondaryCta,
  className,
}: CtaSectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-primary py-16 sm:py-20',
        className
      )}
      aria-labelledby="cta-title"
    >
      {/* Background decoration */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-0 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-[300px] w-[300px] translate-x-1/2 translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="cta-title"
            className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/90">
            {description}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              <Link href={primaryCta.href}>{primaryCta.text}</Link>
            </Button>
            {secondaryCta && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 sm:w-auto"
              >
                <Link href={secondaryCta.href}>{secondaryCta.text}</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
