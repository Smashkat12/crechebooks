import { cn } from '@/lib/utils';

interface Stat {
  value: string;
  label: string;
}

interface StatsCounterProps {
  stats: Stat[];
  className?: string;
}

export function StatsCounter({ stats, className }: StatsCounterProps) {
  return (
    <section
      className={cn('py-12 sm:py-16', className)}
      aria-label="Statistics"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl font-bold text-primary sm:text-4xl lg:text-5xl">
                {stat.value}
              </div>
              <div className="mt-2 text-sm text-muted-foreground sm:text-base">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
