import { FileText, CreditCard, BarChart3, Shield } from 'lucide-react';

import {
  HeroSection,
  FeatureCard,
  PricingCard,
  TestimonialCard,
  CtaSection,
  StatsCounter,
  FaqAccordion,
} from '@/components/public';

const features = [
  {
    icon: <FileText className="h-6 w-6" />,
    title: 'Automated Invoicing',
    description:
      'Generate professional invoices automatically based on enrollment data and fee schedules.',
  },
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: 'Payment Tracking',
    description:
      'Track payments, identify arrears, and send automated reminders to parents.',
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: 'Financial Reports',
    description:
      'Get instant insights with comprehensive reports on revenue, collections, and trends.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'SARS Compliant',
    description:
      'Built-in compliance for South African tax requirements including VAT and EMP201.',
  },
];

const pricingTiers = [
  {
    tier: 'Starter',
    price: 'R299',
    features: [
      'Up to 30 children',
      'Basic invoicing',
      'Payment tracking',
      'Email support',
    ],
    cta: { text: 'Start Free Trial', href: '/signup?plan=starter' },
  },
  {
    tier: 'Professional',
    price: 'R599',
    features: [
      'Up to 100 children',
      'Advanced invoicing',
      'Automated reminders',
      'Financial reports',
      'Priority support',
    ],
    cta: { text: 'Start Free Trial', href: '/signup?plan=professional' },
    highlighted: true,
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    features: [
      'Unlimited children',
      'Multi-branch support',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    cta: { text: 'Contact Sales', href: '/contact?plan=enterprise' },
  },
];

const testimonials = [
  {
    quote:
      'CrecheBooks transformed how we manage our finances. What used to take hours now takes minutes.',
    author: 'Sarah Mbeki',
    role: 'Owner',
    company: 'Little Stars Daycare',
  },
  {
    quote:
      'The automated invoicing and payment reminders have significantly improved our cash flow.',
    author: 'David van der Berg',
    role: 'Administrator',
    company: 'Rainbow Kids Creche',
  },
  {
    quote:
      'Finally, a system that understands the unique needs of South African childcare centres.',
    author: 'Nomvula Dlamini',
    role: 'Director',
    company: 'Bright Futures Preschool',
  },
];

const stats = [
  { value: '500+', label: 'Creches Using CrecheBooks' },
  { value: 'R50M+', label: 'Invoices Processed' },
  { value: '99.9%', label: 'Uptime Guarantee' },
  { value: '4.9/5', label: 'Customer Rating' },
];

const faqItems = [
  {
    question: 'How long does setup take?',
    answer:
      'Most creches are up and running within 24 hours. Our onboarding team will help you import your existing data and configure the system to match your specific needs.',
  },
  {
    question: 'Is CrecheBooks SARS compliant?',
    answer:
      'Yes, CrecheBooks is fully compliant with South African tax requirements. We automatically calculate VAT, generate EMP201 reports, and maintain proper audit trails for all financial transactions.',
  },
  {
    question: 'Can parents pay online?',
    answer:
      'Yes! We integrate with major South African payment providers including EFT, card payments, and debit orders. Parents receive invoices via email with easy payment options.',
  },
  {
    question: 'What support is included?',
    answer:
      'All plans include email support during business hours. Professional and Enterprise plans include priority phone support and dedicated account management.',
  },
  {
    question: 'Can I try before I buy?',
    answer:
      'Absolutely! We offer a 14-day free trial with full access to all features. No credit card required to start.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <HeroSection
        title="Bookkeeping Made Simple for South African Creches"
        subtitle="AI-powered financial management designed specifically for childcare centres. Automate invoicing, track payments, and stay SARS compliant."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Watch Demo', href: '/demo' }}
      />

      {/* Stats Section */}
      <StatsCounter stats={stats} className="border-b" />

      {/* Features Section */}
      <section className="py-16 sm:py-20" aria-labelledby="features-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="features-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Everything You Need to Manage Your Creche Finances
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From invoicing to SARS compliance, CrecheBooks handles it all so
              you can focus on what matters most - the children.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section
        className="bg-muted/40 py-16 sm:py-20"
        aria-labelledby="testimonials-title"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="testimonials-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Trusted by Creches Across South Africa
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard key={index} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 sm:py-20" aria-labelledby="pricing-title">
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
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {pricingTiers.map((tier, index) => (
              <PricingCard key={index} {...tier} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FaqAccordion items={faqItems} className="bg-muted/40" />

      {/* CTA Section */}
      <CtaSection
        title="Ready to Simplify Your Bookkeeping?"
        description="Join hundreds of South African creches already using CrecheBooks. Start your free trial today."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Contact Sales', href: '/contact' }}
      />
    </>
  );
}
