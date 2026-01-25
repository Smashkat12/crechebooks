import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Mail,
  Phone,
  HelpCircle,
  BookOpen,
  MessageSquare,
  CreditCard,
  FileText,
  Users,
  Settings,
  ChevronRight,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CtaSection } from '@/components/public';

export const metadata: Metadata = {
  title: 'Help Center - CrecheBooks',
  description:
    'Find answers to common questions about CrecheBooks. Browse our help articles, FAQs, and get support for our creche financial management software.',
  keywords: [
    'CrecheBooks help',
    'creche software support',
    'childcare management FAQ',
    'CrecheBooks tutorial',
    'billing help',
  ],
  openGraph: {
    title: 'Help Center - CrecheBooks',
    description:
      'Find answers to common questions about CrecheBooks. Browse our help articles and FAQs.',
    type: 'website',
  },
};

const helpCategories = [
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: 'Billing & Payments',
    description: 'Invoicing, payments, and fee management',
    href: '/help/billing',
    articles: 12,
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: 'Parent Management',
    description: 'Managing parent accounts and communications',
    href: '/help/parents',
    articles: 8,
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: 'Reports & SARS',
    description: 'Tax certificates, EMP201, and reporting',
    href: '/help/reports',
    articles: 10,
  },
  {
    icon: <Settings className="h-6 w-6" />,
    title: 'Account Settings',
    description: 'Organization setup and configuration',
    href: '/help/settings',
    articles: 6,
  },
];

const popularArticles = [
  {
    title: 'How to generate monthly invoices',
    href: '/help/billing/generate-invoices',
    category: 'Billing',
  },
  {
    title: 'Setting up fee structures',
    href: '/help/billing/fee-structures',
    category: 'Billing',
  },
  {
    title: 'Generating Section 18A tax certificates',
    href: '/help/reports/tax-certificates',
    category: 'Reports',
  },
  {
    title: 'Recording payments and allocations',
    href: '/help/billing/record-payments',
    category: 'Billing',
  },
  {
    title: 'Sending bulk communications',
    href: '/help/parents/bulk-communications',
    category: 'Parents',
  },
  {
    title: 'EMP201 submission guide',
    href: '/help/reports/emp201',
    category: 'Reports',
  },
];

const faqs = [
  {
    question: 'How do I get started with CrecheBooks?',
    answer:
      'After signing up, you\'ll be guided through an onboarding process to set up your organization, add fee structures, and import or add parents. Our setup wizard makes it easy to get started in minutes.',
  },
  {
    question: 'Can I import existing parent data?',
    answer:
      'Yes! CrecheBooks supports CSV imports for parent data, children, and historical invoices. You can also manually add entries or use our API for integration with other systems.',
  },
  {
    question: 'How does automatic invoicing work?',
    answer:
      'You can configure automatic invoice generation based on your billing cycle (monthly, weekly, etc.). Invoices are generated based on your fee structures and can be automatically emailed to parents.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use industry-standard encryption, secure cloud hosting, and comply with POPIA (Protection of Personal Information Act). Your data is backed up regularly and never shared with third parties.',
  },
  {
    question: 'Can parents pay online?',
    answer:
      'Yes, parents can make payments through the parent portal using various payment methods including EFT, card payments, and debit orders (depending on your configuration).',
  },
  {
    question: 'How do I contact support?',
    answer:
      'You can reach our support team via email at hello@crechebooks.co.za, by phone during business hours, or through the live chat feature. We typically respond within 24 hours.',
  },
];

const contactOptions = [
  {
    icon: <Mail className="h-5 w-5" />,
    title: 'Email Support',
    description: 'Get a response within 24 hours',
    action: 'hello@crechebooks.co.za',
    href: 'mailto:hello@crechebooks.co.za',
  },
  {
    icon: <Phone className="h-5 w-5" />,
    title: 'Phone Support',
    description: 'Mon-Fri 8am-5pm SAST',
    action: '+27 (0)21 XXX XXXX',
    href: 'tel:+27210000000',
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: 'Live Chat',
    description: 'Chat with our team',
    action: 'Start Chat',
    href: '#chat',
  },
];

export default function HelpPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <HelpCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Help Center
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Find answers to your questions, browse help articles, or get in
              touch with our support team.
            </p>

            {/* Search Bar */}
            <div className="mt-8 mx-auto max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search for help articles..."
                  className="pl-10 h-12 text-base"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Help Categories */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-8">
              Browse by Category
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {helpCategories.map((category, index) => (
                <Card
                  key={index}
                  className="group transition-all hover:shadow-md hover:border-primary/50"
                >
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {category.icon}
                    </div>
                    <CardTitle className="mt-4">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link
                      href={category.href}
                      className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      {category.articles} articles
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Popular Articles */}
      <section className="py-16 sm:py-20 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center gap-2 mb-8">
              <BookOpen className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Popular Articles
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {popularArticles.map((article, index) => (
                <Card key={index} className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <Link href={article.href} className="block">
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">
                        {article.category}
                      </span>
                      <p className="mt-1 font-medium text-foreground group-hover:text-primary transition-colors">
                        {article.title}
                      </p>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-8">
              Frequently Asked Questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="py-16 sm:py-20 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">
              Still Need Help?
            </h2>
            <p className="text-muted-foreground mb-8">
              Our support team is here to assist you. Choose how you&apos;d like
              to get in touch.
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {contactOptions.map((option, index) => (
                <Card key={index} className="text-center">
                  <CardContent className="pt-6">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {option.icon}
                    </div>
                    <h3 className="font-semibold">{option.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                    <Button asChild variant="link" className="mt-2">
                      <Link href={option.href}>{option.action}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Portal Links */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle>Parent Portal Help</CardTitle>
                  <CardDescription>
                    Help resources for parents using the parent portal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href="/parent/help">Go to Parent Help</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-2 border-emerald-500/20">
                <CardHeader>
                  <CardTitle>Staff Portal Help</CardTitle>
                  <CardDescription>
                    Help resources for staff members using the staff portal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/staff/help">Go to Staff Help</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CtaSection
        title="Ready to Get Started?"
        description="Start your 14-day free trial today. No credit card required."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Contact Sales', href: '/contact' }}
      />
    </>
  );
}
