import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Mail,
  Phone,
  Clock,
  MapPin,
  HelpCircle,
  BookOpen,
  MessageSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ContactForm, CtaSection } from '@/components/public';

export const metadata: Metadata = {
  title: 'Contact Us - CrecheBooks',
  description:
    'Get in touch with the CrecheBooks team. We\'re here to help with questions about our creche financial management software. Email, phone, or fill out our contact form.',
  keywords: [
    'contact CrecheBooks',
    'creche software support',
    'childcare management help',
    'CrecheBooks phone number',
    'CrecheBooks email',
  ],
  openGraph: {
    title: 'Contact Us - CrecheBooks',
    description:
      'Get in touch with the CrecheBooks team. We\'re here to help with questions about our creche financial management software.',
    type: 'website',
  },
};

const contactInfo = [
  {
    icon: <Mail className="h-5 w-5" />,
    label: 'Email',
    value: 'hello@crechebooks.co.za',
    href: 'mailto:hello@crechebooks.co.za',
  },
  {
    icon: <Phone className="h-5 w-5" />,
    label: 'Phone',
    value: '+27 (0)21 XXX XXXX',
    href: 'tel:+27210000000',
  },
  {
    icon: <Clock className="h-5 w-5" />,
    label: 'Support Hours',
    value: 'Mon-Fri 8am-5pm SAST',
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    label: 'Office',
    value: 'Cape Town, South Africa',
  },
];

const helpLinks = [
  {
    icon: <HelpCircle className="h-5 w-5" />,
    title: 'FAQ',
    description: 'Find answers to common questions',
    href: '/faq',
  },
  {
    icon: <BookOpen className="h-5 w-5" />,
    title: 'Help Center',
    description: 'Browse our knowledge base',
    href: '/help',
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: 'Live Chat',
    description: 'Chat with our support team',
    href: '#chat',
  },
];

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Contact CrecheBooks',
  description:
    'Get in touch with the CrecheBooks team for support, sales, or partnership inquiries.',
  mainEntity: {
    '@type': 'Organization',
    name: 'CrecheBooks',
    email: 'hello@crechebooks.co.za',
    telephone: '+27210000000',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Cape Town',
      addressCountry: 'ZA',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: '+27210000000',
        contactType: 'customer support',
        availableLanguage: ['English', 'Afrikaans'],
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '08:00',
          closes: '17:00',
        },
      },
    ],
  },
};

export default function ContactPage() {
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
              Get in Touch
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Have a question or need help? We&apos;re here for you. Fill out
              the form below or reach us through any of our contact channels.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 sm:py-20" aria-labelledby="contact-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2">
              {/* Contact Form */}
              <div>
                <h2
                  id="contact-title"
                  className="text-2xl font-bold tracking-tight text-foreground"
                >
                  Send Us a Message
                </h2>
                <p className="mt-2 text-muted-foreground">
                  We typically respond within 24 hours during business days.
                </p>
                <div className="mt-6">
                  <ContactForm />
                </div>
              </div>

              {/* Contact Information */}
              <div className="lg:pl-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Contact Information
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Prefer to reach us directly? Here&apos;s how you can contact
                  our team.
                </p>

                {/* Contact Details */}
                <div className="mt-8 space-y-6">
                  {contactInfo.map((item, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="text-foreground hover:text-primary transition-colors"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="text-foreground">{item.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Help Links */}
                <div className="mt-12">
                  <h3 className="text-lg font-semibold text-foreground">
                    Need Quick Help?
                  </h3>
                  <div className="mt-4 space-y-4">
                    {helpLinks.map((link, index) => (
                      <Card
                        key={index}
                        className="group transition-all hover:shadow-md"
                      >
                        <CardContent className="p-4">
                          <Link href={link.href} className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              {link.icon}
                            </div>
                            <div>
                              <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                                {link.title}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {link.description}
                              </p>
                            </div>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Office Location */}
                <div className="mt-12">
                  <h3 className="text-lg font-semibold text-foreground">
                    Our Office
                  </h3>
                  <Card className="mt-4 overflow-hidden">
                    <CardContent className="p-0">
                      {/* Map Placeholder */}
                      <div className="relative h-48 bg-muted">
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                          <MapPin className="h-8 w-8 text-primary mb-2" />
                          <p className="text-sm text-muted-foreground">
                            CrecheBooks Headquarters
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            Cape Town, South Africa
                          </p>
                        </div>
                      </div>
                      <div className="p-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          We operate as a remote-first company with team members
                          across South Africa. For in-person meetings, please
                          schedule an appointment.
                        </p>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="mt-4"
                        >
                          <Link href="/demo">Schedule a Demo</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CtaSection
        title="Ready to Get Started?"
        description="Start your 14-day free trial today. No credit card required."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Book a Demo', href: '/demo' }}
      />
    </>
  );
}
