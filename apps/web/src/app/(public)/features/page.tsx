import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FileText,
  CreditCard,
  Users,
  Shield,
  Building2,
  MessageCircle,
  RefreshCw,
  Calculator,
  Clock,
  BarChart3,
  Mail,
  Smartphone,
  Link2,
  FileSpreadsheet,
  PieChart,
  TrendingUp,
  Wallet,
  CalendarCheck,
  Bell,
  Database,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroSection, FeatureCard, CtaSection } from '@/components/public';
import { IntegrationCard } from '@/components/public/integration-card';

export const metadata: Metadata = {
  title: 'Features - CrecheBooks | Complete Creche Management Solution',
  description:
    'Explore all CrecheBooks features: invoicing, payments, staff payroll, SARS compliance, WhatsApp notifications, Xero integration, and more for South African childcare centres.',
  keywords: [
    'creche software features',
    'daycare invoicing',
    'staff payroll SimplePay',
    'SARS VAT201',
    'EMP201 compliance',
    'WhatsApp notifications',
    'Xero integration',
    'childcare management',
  ],
  openGraph: {
    title: 'Features - CrecheBooks | Complete Creche Management Solution',
    description:
      'Explore all CrecheBooks features for South African childcare centres.',
    type: 'website',
  },
};

const featureCategories = [
  {
    title: 'Financial Management',
    description:
      'Complete control over your creche finances with automated tools.',
    features: [
      {
        icon: <FileText className="h-6 w-6" />,
        title: 'Automated Invoicing',
        description:
          'Generate professional invoices automatically based on enrollment data, fee schedules, and attendance records. Support for recurring invoices and ad-hoc charges.',
      },
      {
        icon: <CreditCard className="h-6 w-6" />,
        title: 'Parent Payments',
        description:
          'Track all parent payments with multiple payment methods including EFT, card payments, and debit orders. Automatic payment matching and receipt generation.',
      },
      {
        icon: <Building2 className="h-6 w-6" />,
        title: 'Bank Reconciliation',
        description:
          'Automatically match bank transactions with invoices and payments. Import statements from major South African banks for accurate financial records.',
      },
      {
        icon: <Wallet className="h-6 w-6" />,
        title: 'Expense Tracking',
        description:
          'Track all business expenses with categorization, receipt uploads, and VAT tracking. Generate expense reports for better financial visibility.',
      },
    ],
  },
  {
    title: 'Staff Management',
    description: 'Streamline your staff administration and payroll processing.',
    features: [
      {
        icon: <Users className="h-6 w-6" />,
        title: 'Staff Payroll (SimplePay)',
        description:
          'Seamlessly manage staff salaries with SimplePay integration. Calculate PAYE, UIF, SDL automatically. Generate IRP5 certificates and payslips.',
      },
      {
        icon: <CalendarCheck className="h-6 w-6" />,
        title: 'Leave Management',
        description:
          'Track annual leave, sick leave, and family responsibility leave. Automatic balance calculations and approval workflows.',
      },
      {
        icon: <Clock className="h-6 w-6" />,
        title: 'Time & Attendance',
        description:
          'Record staff working hours and overtime. Integration with leave management for accurate payroll calculations.',
      },
    ],
  },
  {
    title: 'SARS Compliance',
    description:
      'Stay compliant with South African tax requirements effortlessly.',
    features: [
      {
        icon: <Shield className="h-6 w-6" />,
        title: 'VAT201 Submissions',
        description:
          'Automatically calculate VAT and generate VAT201 reports ready for SARS submission. Track input and output VAT with ease.',
      },
      {
        icon: <Calculator className="h-6 w-6" />,
        title: 'EMP201 Returns',
        description:
          'Generate monthly employer declarations including PAYE, UIF, and SDL. Direct e-filing integration with SARS.',
      },
      {
        icon: <FileSpreadsheet className="h-6 w-6" />,
        title: 'Audit Trail',
        description:
          'Maintain complete audit trails for all financial transactions. Generate reports required for SARS audits and compliance checks.',
      },
    ],
  },
  {
    title: 'Communication',
    description: 'Keep parents informed with automated notifications.',
    features: [
      {
        icon: <MessageCircle className="h-6 w-6" />,
        title: 'WhatsApp Notifications',
        description:
          'Send invoice reminders, payment confirmations, and important updates directly to parents via WhatsApp. High open rates ensure messages are seen.',
      },
      {
        icon: <Mail className="h-6 w-6" />,
        title: 'Email Communications',
        description:
          'Professional email templates for invoices, statements, and announcements. Track email delivery and opens.',
      },
      {
        icon: <Bell className="h-6 w-6" />,
        title: 'Payment Reminders',
        description:
          'Automated reminder schedules for overdue payments. Customizable reminder templates and escalation workflows.',
      },
      {
        icon: <Smartphone className="h-6 w-6" />,
        title: 'SMS Alerts',
        description:
          'Send urgent notifications via SMS. Perfect for time-sensitive communications and parents who prefer text messages.',
      },
    ],
  },
  {
    title: 'Integrations',
    description: 'Connect with the tools you already use.',
    features: [
      {
        icon: <RefreshCw className="h-6 w-6" />,
        title: 'Xero Integration',
        description:
          'Sync your financial data seamlessly with Xero for comprehensive accounting management. Two-way sync for invoices, payments, and expenses.',
      },
      {
        icon: <Link2 className="h-6 w-6" />,
        title: 'SimplePay Integration',
        description:
          'Connect directly with SimplePay for automated payroll processing. Employee data sync and payslip distribution.',
      },
      {
        icon: <Database className="h-6 w-6" />,
        title: 'Banking Integration',
        description:
          'Import statements from major South African banks including FNB, Standard Bank, ABSA, and Nedbank. Automatic categorization and matching.',
      },
    ],
  },
  {
    title: 'Reporting & Analytics',
    description: 'Make informed decisions with powerful insights.',
    features: [
      {
        icon: <BarChart3 className="h-6 w-6" />,
        title: 'Financial Reports',
        description:
          'Generate profit & loss statements, balance sheets, cash flow reports, and aged debtors reports. Export to Excel or PDF.',
      },
      {
        icon: <PieChart className="h-6 w-6" />,
        title: 'Dashboard Analytics',
        description:
          'Visual dashboards showing key metrics: revenue trends, outstanding payments, enrollment statistics, and more.',
      },
      {
        icon: <TrendingUp className="h-6 w-6" />,
        title: 'Custom Reports',
        description:
          'Build custom reports with flexible filters. Schedule automated report delivery to stakeholders.',
      },
    ],
  },
];

const integrations = [
  {
    name: 'Xero',
    description: 'Cloud accounting software for seamless financial management.',
    features: [
      'Two-way invoice sync',
      'Payment reconciliation',
      'Expense tracking',
      'Chart of accounts sync',
    ],
  },
  {
    name: 'SimplePay',
    description: 'South African payroll solution for staff management.',
    features: [
      'Automated payroll processing',
      'SARS compliance',
      'IRP5 certificates',
      'Leave management sync',
    ],
  },
  {
    name: 'South African Banks',
    description:
      'Import statements from all major banks for reconciliation.',
    features: [
      'FNB, Standard Bank, ABSA',
      'Nedbank, Capitec',
      'Automatic categorization',
      'Payment matching',
    ],
  },
  {
    name: 'WhatsApp Business',
    description: 'Reach parents on their preferred messaging platform.',
    features: [
      'Invoice delivery',
      'Payment reminders',
      'Confirmations',
      'Template messages',
    ],
  },
];

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'CrecheBooks Features',
  description:
    'Complete feature list for CrecheBooks childcare management software.',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'CrecheBooks',
    applicationCategory: 'BusinessApplication',
    featureList: featureCategories.flatMap((cat) =>
      cat.features.map((f) => f.title)
    ),
  },
};

export default function FeaturesPage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <HeroSection
        title="Powerful Features for Modern Creches"
        subtitle="Everything you need to manage your childcare centre's finances, staff, and parent communications in one integrated platform."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'View Pricing', href: '/pricing' }}
      />

      {/* Feature Categories */}
      {featureCategories.map((category, categoryIndex) => (
        <section
          key={category.title}
          className={categoryIndex % 2 === 0 ? 'py-16 sm:py-20' : 'bg-muted/40 py-16 sm:py-20'}
          aria-labelledby={`category-${categoryIndex}-title`}
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id={`category-${categoryIndex}-title`}
                className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {category.title}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {category.description}
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {category.features.map((feature, index) => (
                <FeatureCard key={index} {...feature} />
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Integrations Showcase */}
      <section className="py-16 sm:py-20" aria-labelledby="integrations-title">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="integrations-title"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              Seamless Integrations
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Connect CrecheBooks with the tools you already use for a unified
              workflow.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.map((integration, index) => (
              <IntegrationCard key={index} {...integration} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <CtaSection
        title="Ready to Transform Your Creche Operations?"
        description="Join hundreds of South African childcare centres using CrecheBooks. Start your 14-day free trial today."
        primaryCta={{ text: 'Start Free Trial', href: '/signup' }}
        secondaryCta={{ text: 'Contact Sales', href: '/contact' }}
      />
    </>
  );
}
