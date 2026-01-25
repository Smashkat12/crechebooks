'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

interface PricingTier {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  description: string;
  features: string[];
  cta: {
    text: string;
    href: string;
  };
  highlighted?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: 'Starter',
    monthlyPrice: 499,
    annualPrice: 399,
    description: 'Perfect for small creches just getting started.',
    features: [
      'Up to 50 children',
      'Invoicing',
      'Parent payments tracking',
      'Bank reconciliation',
      'Email notifications',
      'Email support',
    ],
    cta: {
      text: 'Start Free Trial',
      href: '/signup?plan=starter',
    },
  },
  {
    name: 'Professional',
    monthlyPrice: 999,
    annualPrice: 799,
    description: 'For growing creches that need more power.',
    features: [
      'Up to 150 children',
      'All Starter features',
      'Staff payroll (SimplePay)',
      'SARS VAT201/EMP201',
      'WhatsApp notifications',
      'Xero integration',
      'Priority support',
    ],
    cta: {
      text: 'Start Free Trial',
      href: '/signup?plan=professional',
    },
    highlighted: true,
  },
  {
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    description: 'For large organisations with custom needs.',
    features: [
      'Unlimited children',
      'All Professional features',
      'Multi-location support',
      'API access',
      'Dedicated account manager',
      'Custom reports',
      'SLA guarantee',
    ],
    cta: {
      text: 'Contact Sales',
      href: '/contact?plan=enterprise',
    },
  },
];

function PricingCard({
  tier,
  billingPeriod,
}: {
  tier: PricingTier;
  billingPeriod: 'monthly' | 'annual';
}) {
  const price =
    billingPeriod === 'annual' ? tier.annualPrice : tier.monthlyPrice;
  const isCustom = price === null;

  return (
    <Card
      className={cn(
        'relative flex flex-col transition-all',
        tier.highlighted
          ? 'border-primary shadow-lg ring-2 ring-primary'
          : 'hover:shadow-md'
      )}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
            Most Popular
          </span>
        </div>
      )}
      <CardHeader className="text-center">
        <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
        <div className="mt-4">
          {isCustom ? (
            <span className="text-4xl font-bold text-foreground">Custom</span>
          ) : (
            <>
              <span className="text-4xl font-bold text-foreground">
                R{price}
              </span>
              <span className="text-muted-foreground">/month</span>
            </>
          )}
        </div>
        {billingPeriod === 'annual' && !isCustom && (
          <p className="mt-1 text-sm text-primary">
            Save 20% with annual billing
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3" role="list" aria-label={`${tier.name} features`}>
          {tier.features.map((feature, index) => (
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
          variant={tier.highlighted ? 'default' : 'outline'}
          size="lg"
        >
          <Link href={tier.cta.href}>{tier.cta.text}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function LandingPricingSection() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>(
    'annual'
  );

  return (
    <section
      className="bg-muted/40 py-16 sm:py-20"
      aria-labelledby="pricing-title"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="pricing-title"
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Choose the plan that fits your creche. All plans include a 14-day
            free trial.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span
              className={cn(
                'text-sm font-medium transition-colors',
                billingPeriod === 'monthly'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={billingPeriod === 'annual'}
              onClick={() =>
                setBillingPeriod(
                  billingPeriod === 'monthly' ? 'annual' : 'monthly'
                )
              }
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                billingPeriod === 'annual' ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform',
                  billingPeriod === 'annual'
                    ? 'translate-x-5'
                    : 'translate-x-0'
                )}
              />
            </button>
            <span
              className={cn(
                'text-sm font-medium transition-colors',
                billingPeriod === 'annual'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              Annual
            </span>
            <span className="ml-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Save 20%
            </span>
          </div>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              billingPeriod={billingPeriod}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
