import type { Metadata } from 'next';
import {
  Play,
  UserCheck,
  Lightbulb,
  ShieldCheck,
  Clock,
  Headphones,
} from 'lucide-react';

import { DemoForm } from '@/components/public';

export const metadata: Metadata = {
  title: 'Book Your Free Demo - CrecheBooks',
  description:
    'Schedule a free, personalised demo of CrecheBooks. See how our creche financial management software can save you time and streamline your operations.',
  keywords: [
    'CrecheBooks demo',
    'creche software demo',
    'childcare management demo',
    'free demo booking',
    'daycare software trial',
  ],
  openGraph: {
    title: 'Book Your Free Demo - CrecheBooks',
    description:
      'Schedule a free, personalised demo of CrecheBooks. See how our creche financial management software can save you time.',
    type: 'website',
  },
};

const benefits = [
  {
    icon: <Play className="h-5 w-5" />,
    title: 'See CrecheBooks in Action',
    description:
      'Watch a live walkthrough of all features tailored to your specific needs.',
  },
  {
    icon: <UserCheck className="h-5 w-5" />,
    title: 'Get Personalised Recommendations',
    description:
      'Our team will suggest the best setup and features for your creche size and requirements.',
  },
  {
    icon: <Lightbulb className="h-5 w-5" />,
    title: 'Learn About Implementation',
    description:
      'Understand how easy it is to get started and migrate your existing data.',
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'No Commitment Required',
    description:
      'Ask all your questions with zero pressure. We want you to make the right choice for your creche.',
  },
];

const demoHighlights = [
  {
    icon: <Clock className="h-5 w-5" />,
    text: '30-minute focused session',
  },
  {
    icon: <Headphones className="h-5 w-5" />,
    text: 'One-on-one with a product expert',
  },
];

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Book a Demo - CrecheBooks',
  description:
    'Schedule a free, personalised demo of CrecheBooks creche financial management software.',
  mainEntity: {
    '@type': 'Service',
    name: 'CrecheBooks Demo',
    provider: {
      '@type': 'Organization',
      name: 'CrecheBooks',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'ZAR',
      description: 'Free personalised product demonstration',
    },
  },
};

export default function DemoPage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Book Your Free Demo
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              See how CrecheBooks can transform your creche&apos;s financial
              management. Our team will walk you through the platform and answer
              all your questions.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              {demoHighlights.map((highlight, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <div className="text-primary">{highlight.icon}</div>
                  <span>{highlight.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Demo Request Section */}
      <section className="py-16 sm:py-20" aria-labelledby="demo-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2">
              {/* Benefits Column */}
              <div className="lg:pr-8">
                <h2
                  id="demo-title"
                  className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                >
                  What You&apos;ll Get from Your Demo
                </h2>
                <p className="mt-4 text-muted-foreground">
                  In just 30 minutes, you&apos;ll discover how CrecheBooks can
                  save you hours every week on financial administration.
                </p>

                <div className="mt-8 space-y-6">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {benefit.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {benefit.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Trust Indicators */}
                <div className="mt-12 rounded-lg border bg-muted/30 p-6">
                  <h3 className="font-semibold text-foreground">
                    Trusted by Creches Across South Africa
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Join hundreds of creche owners who have already simplified
                    their financial management with CrecheBooks. Our customers
                    report saving an average of 10+ hours per month on
                    administrative tasks.
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-primary">500+</span>
                      <span className="text-muted-foreground">Creches</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-primary">4.9/5</span>
                      <span className="text-muted-foreground">Rating</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-primary">10+</span>
                      <span className="text-muted-foreground">
                        Hours saved/month
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Column */}
              <div>
                <div className="sticky top-8">
                  <h2 className="mb-6 text-xl font-semibold text-foreground">
                    Request Your Free Demo
                  </h2>
                  <DemoForm />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-muted/40 py-16 sm:py-20" aria-labelledby="faq-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2
              id="faq-title"
              className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              Frequently Asked Questions
            </h2>
            <div className="mt-8 space-y-6">
              <div>
                <h3 className="font-semibold text-foreground">
                  How long is the demo?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Our demos typically last 30 minutes, but we&apos;re happy to
                  extend the session if you have more questions.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Is the demo really free?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Absolutely! There&apos;s no cost and no obligation. We believe
                  in showing you the value before you commit.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  What do I need to prepare?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Nothing at all! Just come with your questions. It helps if you
                  have a general idea of your creche size and current
                  challenges, but we&apos;ll guide you through everything.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Can I invite my colleagues?
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Of course! We encourage you to include anyone who would be
                  involved in using the software - administrators, accountants,
                  or owners.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
