import type { Metadata } from 'next';
import {
  FileText,
  CreditCard,
  Users,
  Shield,
  Building2,
  MessageCircle,
  RefreshCw,
  MapPin,
  UserPlus,
  Settings,
  Rocket,
} from 'lucide-react';

import {
  HeroSection,
  FeatureCard,
  TestimonialCard,
  CtaSection,
  StatsCounter,
  FaqAccordion,
  LandingPricingSection,
} from '@/components/public';

export const metadata: Metadata = {
  title: 'CrecheBooks - Simplify Your Creche Bookkeeping',
  description:
    'Complete financial management for South African childcare centres. From invoicing to SARS compliance, we handle it all.',
  keywords: [
    'creche software',
    'daycare management',
    'childcare invoicing',
    'South Africa',
    'SARS compliant',
  ],
  openGraph: {
    title: 'CrecheBooks - Simplify Your Creche Bookkeeping',
    description:
      'Complete financial management for South African childcare centres.',
    type: 'website',
  },
};

const features = [
  {
    icon: <FileText className="h-6 w-6" />,
    title: 'Automated Invoicing',
    description:
      'Generate professional invoices automatically based on enrollment data and fee schedules.',
  },
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: 'Parent Payments Tracking',
    description:
      'Track payments, identify arrears, and send automated reminders to parents.',
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: 'Staff Payroll (SimplePay)',
    description:
      'Seamlessly manage staff salaries with SimplePay integration for accurate payroll processing.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'SARS VAT201/EMP201',
    description:
      'Built-in compliance for South African tax requirements including VAT and EMP201 submissions.',
  },
  {
    icon: <Building2 className="h-6 w-6" />,
    title: 'Bank Reconciliation',
    description:
      'Automatically match bank transactions with invoices and payments for accurate records.',
  },
  {
    icon: <MessageCircle className="h-6 w-6" />,
    title: 'WhatsApp Notifications',
    description:
      'Send invoice reminders and payment confirmations directly to parents via WhatsApp.',
  },
  {
    icon: <RefreshCw className="h-6 w-6" />,
    title: 'Xero Integration',
    description:
      'Sync your financial data seamlessly with Xero for comprehensive accounting management.',
  },
  {
    icon: <MapPin className="h-6 w-6" />,
    title: 'Multi-Location Support',
    description:
      'Manage multiple creche branches from a single dashboard with consolidated reporting.',
  },
];

const howItWorksSteps = [
  {
    icon: <UserPlus className="h-8 w-8" />,
    step: '1',
    title: 'Sign Up & Import',
    description:
      'Create your account and import existing data in minutes. Our onboarding wizard guides you through every step.',
  },
  {
    icon: <Settings className="h-8 w-8" />,
    step: '2',
    title: 'Configure & Customize',
    description:
      'Set up fee structures, payment terms, and notification preferences to match your creche operations.',
  },
  {
    icon: <Rocket className="h-8 w-8" />,
    step: '3',
    title: 'Automate & Grow',
    description:
      'Let CrecheBooks handle the numbers while you focus on the children. Watch your efficiency soar.',
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
  { value: '500+', label: 'Creches' },
  { value: '10,000+', label: 'Parents' },
  { value: 'R50M+', label: 'Processed' },
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

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'CrecheBooks',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Complete financial management for South African childcare centres. From invoicing to SARS compliance, we handle it all.',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'ZAR',
    lowPrice: '399',
    highPrice: '999',
    offerCount: '3',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '500',
    bestRating: '5',
    worstRating: '1',
  },
  provider: {
    '@type': 'Organization',
    name: 'CrecheBooks',
    url: 'https://crechebooks.co.za',
  },
  featureList: [
    'Automated Invoicing',
    'Parent Payments Tracking',
    'Staff Payroll Integration',
    'SARS VAT201/EMP201 Compliance',
    'Bank Reconciliation',
    'WhatsApp Notifications',
    'Xero Integration',
    'Multi-Location Support',
  ],
};

export default function HomePage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <HeroSection
        title="Simplify Your Creche Bookkeeping"
        subtitle="Complete financial management for South African childcare centres. From invoicing to SARS compliance, we handle it all."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Book a Demo', href: '/demo' }}
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

      {/* How It Works Section */}
      <section
        className="bg-muted/40 py-16 sm:py-20"
        aria-labelledby="how-it-works-title"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="how-it-works-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Get started in three simple steps and transform your creche
              finances today.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {howItWorksSteps.map((step, index) => (
              <div
                key={index}
                className="relative flex flex-col items-center text-center"
              >
                {/* Connector line for desktop */}
                {index < howItWorksSteps.length - 1 && (
                  <div className="absolute left-1/2 top-12 hidden h-0.5 w-full bg-border md:block" />
                )}
                <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {step.icon}
                </div>
                <div className="mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {step.step}
                </div>
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 sm:py-20" aria-labelledby="testimonials-title">
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
      <LandingPricingSection />

      {/* FAQ Section */}
      <FaqAccordion items={faqItems} />

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
