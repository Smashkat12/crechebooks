import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles,
  Shield,
  HeartHandshake,
  Headphones,
  Target,
  Eye,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CtaSection, TeamMemberCard } from '@/components/public';

export const metadata: Metadata = {
  title: 'About Us - CrecheBooks',
  description:
    'Learn about CrecheBooks - the team behind South Africa\'s leading creche financial management software. Our mission is empowering creche owners to focus on children, not paperwork.',
  keywords: [
    'about CrecheBooks',
    'creche software South Africa',
    'childcare management team',
    'daycare software company',
  ],
  openGraph: {
    title: 'About Us - CrecheBooks',
    description:
      'Learn about CrecheBooks - the team behind South Africa\'s leading creche financial management software.',
    type: 'website',
  },
};

const companyValues = [
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: 'Simplicity',
    description:
      'Making bookkeeping effortless. We believe financial management should be intuitive, not intimidating.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Reliability',
    description:
      'Dependable software you can count on. Your data is secure, backed up, and always accessible when you need it.',
  },
  {
    icon: <HeartHandshake className="h-6 w-6" />,
    title: 'Compliance',
    description:
      'Built for South African tax requirements. Stay compliant with SARS regulations without the complexity.',
  },
  {
    icon: <Headphones className="h-6 w-6" />,
    title: 'Support',
    description:
      'Real help when you need it. Our dedicated team understands the unique challenges of running a creche.',
  },
];

const teamMembers = [
  {
    name: 'Thabo Molefe',
    role: 'Founder & CEO',
    bio: 'Former accountant with 15 years experience helping childcare centres manage their finances.',
    linkedin: 'https://linkedin.com',
  },
  {
    name: 'Lerato Nkosi',
    role: 'Head of Product',
    bio: 'EdTech specialist passionate about building tools that make a difference in early childhood education.',
    linkedin: 'https://linkedin.com',
  },
  {
    name: 'Johan van Wyk',
    role: 'Lead Developer',
    bio: 'Full-stack engineer focused on creating reliable, scalable solutions for South African businesses.',
    linkedin: 'https://linkedin.com',
  },
  {
    name: 'Nomvula Dlamini',
    role: 'Customer Success Lead',
    bio: 'Dedicated to ensuring every creche gets the most out of CrecheBooks with personalised support.',
    linkedin: 'https://linkedin.com',
  },
];

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'CrecheBooks',
  url: 'https://crechebooks.co.za',
  logo: 'https://crechebooks.co.za/logo.png',
  description:
    'Complete financial management software for South African childcare centres.',
  foundingDate: '2022',
  founders: [
    {
      '@type': 'Person',
      name: 'Thabo Molefe',
    },
  ],
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Cape Town',
    addressCountry: 'ZA',
  },
  sameAs: [
    'https://www.linkedin.com/company/crechebooks',
    'https://www.facebook.com/crechebooks',
    'https://twitter.com/crechebooks',
  ],
};

export default function AboutPage() {
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
              About CrecheBooks
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              We&apos;re on a mission to simplify financial management for South
              African childcare centres, so you can focus on what matters most -
              the children.
            </p>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-16 sm:py-20" aria-labelledby="story-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2
              id="story-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Our Story
            </h2>
            <div className="mt-6 space-y-4 text-muted-foreground">
              <p>
                CrecheBooks was founded in 2022 by Thabo Molefe, a chartered
                accountant who spent over a decade helping childcare centres
                navigate the complexities of financial management in South
                Africa.
              </p>
              <p>
                After witnessing countless creche owners struggle with
                spreadsheets, late payments, and SARS compliance, Thabo realised
                there had to be a better way. He assembled a team of passionate
                developers and childcare experts to build a solution tailored
                specifically for the South African market.
              </p>
              <p>
                Today, CrecheBooks serves hundreds of creches across the
                country, processing millions of rands in payments and helping
                owners reclaim hours each week that were previously spent on
                paperwork.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision Section */}
      <section
        className="bg-muted/40 py-16 sm:py-20"
        aria-labelledby="mission-title"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2">
            {/* Mission */}
            <div className="flex flex-col">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-6 w-6" />
              </div>
              <h2
                id="mission-title"
                className="text-2xl font-bold tracking-tight text-foreground"
              >
                Our Mission
              </h2>
              <p className="mt-4 text-lg font-medium text-primary">
                &ldquo;Empowering creche owners to focus on children, not
                paperwork.&rdquo;
              </p>
              <p className="mt-4 text-muted-foreground">
                We believe that every minute spent wrestling with spreadsheets
                is a minute away from the children who need your attention. Our
                software handles the numbers so you can nurture young minds.
              </p>
            </div>

            {/* Vision */}
            <div className="flex flex-col">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Eye className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Our Vision
              </h2>
              <p className="mt-4 text-muted-foreground">
                To be the trusted financial partner for every childcare centre
                in South Africa. We envision a future where creche owners spend
                their days focused entirely on early childhood development,
                confident that their finances are handled with precision and
                care.
              </p>
              <p className="mt-4 text-muted-foreground">
                By 2030, we aim to serve 5,000+ creches and help process over R1
                billion in parent payments annually.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 sm:py-20" aria-labelledby="values-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="values-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Our Values
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              These principles guide everything we do at CrecheBooks.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {companyValues.map((value, index) => (
              <Card
                key={index}
                className="group relative overflow-hidden transition-all hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div
                    className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden="true"
                  >
                    {value.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section
        className="bg-muted/40 py-16 sm:py-20"
        aria-labelledby="team-title"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="team-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Meet the Team
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A passionate group dedicated to making creche financial management
              simple.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {teamMembers.map((member, index) => (
              <TeamMemberCard key={index} {...member} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CtaSection
        title="Ready to Join Our Growing Community?"
        description="Join hundreds of South African creches already using CrecheBooks to simplify their finances."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Contact Us', href: '/contact' }}
      />
    </>
  );
}
