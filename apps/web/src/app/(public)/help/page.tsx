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
  Search,
  CheckCircle,
  ArrowRight,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// Billing & Payments Help Content
const billingHelp = {
  icon: <CreditCard className="h-6 w-6" />,
  title: 'Billing & Payments',
  description: 'Everything you need to know about invoicing, payments, and fee management',
  topics: [
    {
      title: 'Generating Monthly Invoices',
      content: `To generate monthly invoices:
1. Navigate to **Invoices** > **Generate Invoices**
2. Select the billing period (month/year)
3. Choose which parents to include (all or specific)
4. Review the invoice preview
5. Click **Generate** to create invoices
6. Optionally send invoices via email immediately

Invoices are calculated based on your configured fee structures and any additional charges or credits applied to each child's account.`,
    },
    {
      title: 'Setting Up Fee Structures',
      content: `Fee structures define what you charge parents. To set up:
1. Go to **Settings** > **Fees**
2. Click **Add Fee Structure**
3. Enter the fee name (e.g., "Monthly Tuition - Full Day")
4. Set the amount and frequency (monthly, weekly, once-off)
5. Configure age groups or classes if applicable
6. Save the fee structure

You can create multiple fee structures for different programs, age groups, or attendance patterns.`,
    },
    {
      title: 'Recording Payments',
      content: `When you receive a payment:
1. Go to **Payments** > **Record Payment**
2. Select the parent making the payment
3. Enter the payment amount and date
4. Choose the payment method (EFT, cash, card, etc.)
5. Add a reference number if applicable
6. Allocate the payment to specific invoices or leave as credit

Payments can be automatically matched to outstanding invoices or manually allocated.`,
    },
    {
      title: 'Managing Arrears',
      content: `To manage overdue accounts:
1. Go to **Arrears** to see all overdue accounts
2. View aging reports (30, 60, 90+ days)
3. Send payment reminders via email or SMS
4. Set up automatic reminder schedules
5. Record payment arrangements if needed
6. Generate arrears letters for formal collection

You can also set up automated workflows to send reminders at specific intervals.`,
    },
  ],
};

// Parent Management Help Content
const parentHelp = {
  icon: <Users className="h-6 w-6" />,
  title: 'Parent Management',
  description: 'Managing parent accounts, communications, and enrollments',
  topics: [
    {
      title: 'Adding New Parents',
      content: `To add a new parent:
1. Navigate to **Parents** > **Add New**
2. Enter parent contact details (name, email, phone)
3. Add billing address
4. Set communication preferences
5. Add children to the parent account
6. Configure fee structures for each child
7. Save the parent profile

Parents will receive a welcome email with login instructions for the Parent Portal.`,
    },
    {
      title: 'Sending Bulk Communications',
      content: `To send messages to multiple parents:
1. Go to **Communications** > **New Message**
2. Select recipients (all parents, specific groups, or individuals)
3. Choose the channel (email, SMS, or both)
4. Write your message using the template editor
5. Preview the message
6. Schedule or send immediately

You can use merge fields like {{parent_name}} and {{child_name}} for personalization.`,
    },
    {
      title: 'Managing Enrollments',
      content: `To manage child enrollments:
1. Go to **Enrollments** to see all enrolled children
2. Click on a child to view/edit their enrollment
3. Update class assignments or attendance schedules
4. Modify fee structures as needed
5. Process year-end promotions in bulk
6. Handle withdrawals with proper end-dating

Use the **Year-End** wizard to promote children to new classes at the end of each year.`,
    },
    {
      title: 'Parent Portal Access',
      content: `Parents can access their portal to:
- View and download invoices
- See their account statement and balance
- Make online payments (if configured)
- Update contact information
- View their children's details

Parents log in using their email address and receive a one-time password (OTP) for security.`,
    },
  ],
};

// Reports & SARS Help Content
const reportsHelp = {
  icon: <FileText className="h-6 w-6" />,
  title: 'Reports & SARS',
  description: 'Tax certificates, EMP201 submissions, and financial reporting',
  topics: [
    {
      title: 'Generating Section 18A Tax Certificates',
      content: `If your creche is a registered PBO (Public Benefit Organisation):
1. Go to **Reports** > **Tax Certificates**
2. Select the tax year
3. Review eligible donations/payments
4. Generate certificates for all qualifying parents
5. Download or email certificates to parents

Section 18A certificates allow parents to claim tax deductions. Ensure your PBO registration is up to date in Settings.`,
    },
    {
      title: 'EMP201 Monthly Submission',
      content: `To prepare your EMP201 submission:
1. Navigate to **SARS** > **EMP201**
2. Select the tax period (month/year)
3. Review calculated PAYE, UIF, and SDL amounts
4. Verify against your payroll records
5. Export the EMP201 data file
6. Submit via SARS eFiling

CrecheBooks calculates totals based on your staff payroll data. Always reconcile before submission.`,
    },
    {
      title: 'Financial Reports',
      content: `Available reports include:
- **Income Report**: Revenue by period and category
- **Arrears Report**: Outstanding balances by parent
- **Payment Report**: All payments received
- **Fee Analysis**: Breakdown by fee structure
- **Reconciliation Report**: Bank statement matching

Access all reports from the **Reports** section. Export to PDF or Excel as needed.`,
    },
    {
      title: 'VAT201 Submission',
      content: `If your creche is VAT registered:
1. Go to **SARS** > **VAT201**
2. Select the VAT period
3. Review output and input VAT calculations
4. Verify category allocations
5. Export the VAT201 data
6. Submit via SARS eFiling

Ensure your VAT registration number is configured in Settings for accurate calculations.`,
    },
  ],
};

// Account Settings Help Content
const settingsHelp = {
  icon: <Settings className="h-6 w-6" />,
  title: 'Account Settings',
  description: 'Organization setup, users, and system configuration',
  topics: [
    {
      title: 'Organization Setup',
      content: `Configure your organization details:
1. Go to **Settings** > **Organization**
2. Enter your creche name and registration numbers
3. Add your logo for invoices and communications
4. Set your physical and postal addresses
5. Configure banking details for payment instructions
6. Add social media links if applicable

This information appears on invoices, statements, and official documents.`,
    },
    {
      title: 'Managing Users',
      content: `To add or manage system users:
1. Navigate to **Settings** > **Users**
2. Click **Invite User** to add new team members
3. Set their role (Admin, Staff, Accountant, etc.)
4. Configure access permissions
5. Send the invitation email

Users receive an email to set up their account. You can deactivate users without deleting their history.`,
    },
    {
      title: 'Email Templates',
      content: `Customize your communication templates:
1. Go to **Settings** > **Templates**
2. Select the template type (invoice, reminder, statement, etc.)
3. Edit the subject line and body content
4. Use merge fields for personalization
5. Preview and save

Templates support HTML formatting and your organization's branding.`,
    },
    {
      title: 'Integrations',
      content: `CrecheBooks integrates with:
- **SimplePay**: Sync staff payroll data
- **Xero**: Export financial data
- **Banking**: Import bank statements for reconciliation

Go to **Settings** > **Integrations** to configure connections. Each integration has its own setup wizard.`,
    },
  ],
};

// General FAQs
const generalFaqs = [
  {
    question: 'How do I get started with CrecheBooks?',
    answer:
      'After signing up, you\'ll be guided through an onboarding process to set up your organization, add fee structures, and import or add parents. Our setup wizard makes it easy to get started in minutes. You can also book a free onboarding call with our team.',
  },
  {
    question: 'Can I import existing parent data?',
    answer:
      'Yes! CrecheBooks supports CSV imports for parent data, children, and historical invoices. Go to Settings > Import Data to upload your spreadsheets. We provide templates and validation to ensure your data imports correctly.',
  },
  {
    question: 'How does automatic invoicing work?',
    answer:
      'You can configure automatic invoice generation based on your billing cycle (monthly, weekly, etc.). Set this up in Settings > Billing. Invoices are generated based on your fee structures and can be automatically emailed to parents on a schedule you define.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use industry-standard AES-256 encryption, secure cloud hosting on AWS, and comply with POPIA (Protection of Personal Information Act). Your data is backed up daily and never shared with third parties. We also support two-factor authentication.',
  },
  {
    question: 'Can parents pay online?',
    answer:
      'Yes, parents can make payments through the Parent Portal. Depending on your configuration, they can pay via EFT, card payments (Visa/Mastercard), or set up debit orders. Go to Settings > Payments to configure payment methods.',
  },
  {
    question: 'How do I contact support?',
    answer:
      'You can reach our support team via email at hello@crechebooks.co.za, by phone during business hours (Mon-Fri 8am-5pm SAST), or through the in-app chat. We typically respond within 24 hours for email and aim for immediate assistance via chat during business hours.',
  },
  {
    question: 'Can I use CrecheBooks on my phone?',
    answer:
      'Yes! CrecheBooks is fully responsive and works on any device. Parents can access the Parent Portal from their smartphones, and administrators can manage operations on tablets. We\'re also developing dedicated mobile apps.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer:
      'You can export all your data at any time from Settings > Export Data. If you cancel your subscription, your data is retained for 90 days, giving you time to export or reactivate. After 90 days, data is securely deleted per POPIA requirements.',
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
    href: '/contact',
  },
];

// Helper component for topic cards
function TopicCard({ title, content }: { title: string; content: string }) {
  return (
    <AccordionItem value={title}>
      <AccordionTrigger className="text-left hover:no-underline">
        <span className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
          {title}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="pl-6 prose prose-sm dark:prose-invert max-w-none">
          {content.split('\n').map((line, i) => (
            <p key={i} className="my-2 text-muted-foreground whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// Helper component for help sections
function HelpSection({ data }: { data: typeof billingHelp }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
          {data.icon}
        </div>
        <div>
          <h3 className="text-xl font-semibold">{data.title}</h3>
          <p className="text-muted-foreground">{data.description}</p>
        </div>
      </div>
      <Accordion type="single" collapsible className="w-full">
        {data.topics.map((topic) => (
          <TopicCard key={topic.title} title={topic.title} content={topic.content} />
        ))}
      </Accordion>
    </div>
  );
}

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

      {/* Quick Navigation */}
      <section className="py-12 border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <a href="#billing" className="group">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Billing & Payments</p>
                        <p className="text-xs text-muted-foreground">Invoices, fees, payments</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
              <a href="#parents" className="group">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Parent Management</p>
                        <p className="text-xs text-muted-foreground">Accounts, communications</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
              <a href="#reports" className="group">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Reports & SARS</p>
                        <p className="text-xs text-muted-foreground">Tax, EMP201, reporting</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
              <a href="#settings" className="group">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Settings className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Account Settings</p>
                        <p className="text-xs text-muted-foreground">Setup, users, config</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Help Content Sections */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <Tabs defaultValue="billing" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-8">
                <TabsTrigger value="billing" className="text-xs sm:text-sm">Billing</TabsTrigger>
                <TabsTrigger value="parents" className="text-xs sm:text-sm">Parents</TabsTrigger>
                <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
                <TabsTrigger value="settings" className="text-xs sm:text-sm">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="billing" id="billing">
                <HelpSection data={billingHelp} />
              </TabsContent>

              <TabsContent value="parents" id="parents">
                <HelpSection data={parentHelp} />
              </TabsContent>

              <TabsContent value="reports" id="reports">
                <HelpSection data={reportsHelp} />
              </TabsContent>

              <TabsContent value="settings" id="settings">
                <HelpSection data={settingsHelp} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-20 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 mb-8 justify-center">
              <BookOpen className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Frequently Asked Questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {generalFaqs.map((faq, index) => (
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
      <section className="py-16 sm:py-20">
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
      <section className="py-16 sm:py-20 bg-muted/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-8">
              Portal-Specific Help
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Parent Portal Help
                  </CardTitle>
                  <CardDescription>
                    Help for parents using the parent portal to view invoices, make payments, and manage their account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full sm:w-auto">
                    <Link href="/parent/help">
                      Go to Parent Help
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-2 border-emerald-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Staff Portal Help
                  </CardTitle>
                  <CardDescription>
                    Help for staff members accessing payslips, requesting leave, and managing their profile.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/staff/help">
                      Go to Staff Help
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
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
