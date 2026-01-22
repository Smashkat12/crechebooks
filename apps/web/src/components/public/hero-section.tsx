import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CtaButton {
  text: string;
  href: string;
}

interface HeroSectionProps {
  title: string;
  subtitle: string;
  primaryCta: CtaButton;
  secondaryCta?: CtaButton;
  className?: string;
}

export function HeroSection({
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  className,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background py-20 sm:py-28 lg:py-32',
        className
      )}
      aria-labelledby="hero-title"
    >
      {/* Background decoration */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            id="hero-title"
            className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            {title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {subtitle}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={primaryCta.href}>{primaryCta.text}</Link>
            </Button>
            {secondaryCta && (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
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
