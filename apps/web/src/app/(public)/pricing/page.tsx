import type { Metadata } from 'next';

import { PricingPageClient } from './pricing-page-client';

export const metadata: Metadata = {
  title: 'Pricing - CrecheBooks | Affordable Creche Management',
  description:
    'Simple, transparent pricing for CrecheBooks. Plans starting from R399/month. 14-day free trial. No credit card required.',
  keywords: [
    'creche software pricing',
    'daycare management cost',
    'childcare software South Africa',
    'affordable creche solution',
  ],
  openGraph: {
    title: 'Pricing - CrecheBooks | Affordable Creche Management',
    description:
      'Simple, transparent pricing for CrecheBooks. Plans starting from R399/month.',
    type: 'website',
  },
};

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'CrecheBooks Pricing',
  description: 'Pricing plans for CrecheBooks childcare management software.',
  mainEntity: {
    '@type': 'Product',
    name: 'CrecheBooks',
    offers: [
      {
        '@type': 'Offer',
        name: 'Starter',
        priceCurrency: 'ZAR',
        price: '399',
        priceValidUntil: '2025-12-31',
        availability: 'https://schema.org/InStock',
        description: 'Up to 50 children, basic features',
      },
      {
        '@type': 'Offer',
        name: 'Professional',
        priceCurrency: 'ZAR',
        price: '799',
        priceValidUntil: '2025-12-31',
        availability: 'https://schema.org/InStock',
        description: 'Up to 150 children, all features',
      },
    ],
  },
};

export default function PricingPage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PricingPageClient />
    </>
  );
}
