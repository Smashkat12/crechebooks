'use client';

/**
 * Parent Portal Help Page
 * Help and support resources for parents
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  BookOpen,
  MessageSquare,
  Mail,
  Phone,
  FileText,
  Baby,
  User,
  ChevronRight,
  Search,
  ExternalLink,
  Receipt,
  Wallet,
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

const helpTopics = [
  {
    icon: <Receipt className="h-5 w-5" />,
    title: 'Invoices',
    description: 'View and understand your invoices',
    links: [
      { title: 'How to view invoices', href: '#invoices-view' },
      { title: 'Understanding invoice items', href: '#invoices-items' },
      { title: 'Downloading invoice PDF', href: '#invoices-download' },
    ],
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: 'Payments',
    description: 'Making and tracking payments',
    links: [
      { title: 'How to make a payment', href: '#payments-make' },
      { title: 'Payment methods accepted', href: '#payments-methods' },
      { title: 'View payment history', href: '#payments-history' },
    ],
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Statements',
    description: 'Account statements and history',
    links: [
      { title: 'View account statement', href: '#statements-view' },
      { title: 'Understanding your balance', href: '#statements-balance' },
      { title: 'Download statement PDF', href: '#statements-download' },
    ],
  },
  {
    icon: <Baby className="h-5 w-5" />,
    title: 'Children',
    description: 'Manage your children\'s information',
    links: [
      { title: 'View enrolled children', href: '#children-view' },
      { title: 'Update child details', href: '#children-update' },
      { title: 'Enrollment information', href: '#children-enrollment' },
    ],
  },
];

const faqs = [
  {
    question: 'How do I view my invoices?',
    answer:
      'Navigate to "Invoices" from the main menu. You\'ll see a list of all your invoices with their status (paid, pending, overdue). Click on any invoice to view the full details or download a PDF copy.',
  },
  {
    question: 'How can I make a payment?',
    answer:
      'Go to "Payments" in the main menu. You can pay individual invoices or make a general payment toward your account balance. We accept EFT, card payments, and other methods configured by your creche.',
  },
  {
    question: 'Where can I find my statement?',
    answer:
      'Your account statement is available under "Statements". This shows all invoices, payments, and your current balance. You can download a PDF statement for any period.',
  },
  {
    question: 'How do I update my contact details?',
    answer:
      'Go to "Profile" from the menu. You can update your phone number, email address, and physical address. Some changes may require verification for security purposes.',
  },
  {
    question: 'Can I receive invoices via WhatsApp?',
    answer:
      'Yes! You can opt-in to receive invoices and payment reminders via WhatsApp. Go to "Profile" and enable WhatsApp notifications under Communication Preferences. You can opt-out at any time.',
  },
  {
    question: 'What if I have a billing dispute?',
    answer:
      'If you believe there\'s an error on your invoice or have questions about charges, please contact the creche directly. You can find their contact details below or on your invoice.',
  },
  {
    question: 'How do I get my tax certificate?',
    answer:
      'Tax certificates (Section 18A) are generated annually by the creche if they are a registered PBO. These are typically available after the end of the tax year. Contact the creche for more information.',
  },
];

const contactInfo = {
  creche: {
    name: 'Your Creche',
    email: 'admin@example-creche.co.za',
    phone: '+27 11 123 4567',
  },
  support: {
    email: 'support@crechebooks.co.za',
    hours: 'Mon-Fri 8am-5pm SAST',
  },
};

export default function ParentHelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <HelpCircle className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Help & Support</h1>
        <p className="text-muted-foreground mt-1">
          Find answers to common questions and get support
        </p>
      </div>

      {/* Search */}
      <div className="max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search help articles..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {helpTopics.map((topic, index) => (
          <Card key={index} className="group hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {topic.icon}
                </div>
                <div>
                  <CardTitle className="text-base">{topic.title}</CardTitle>
                </div>
              </div>
              <CardDescription className="text-xs mt-1">
                {topic.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {topic.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <ChevronRight className="h-3 w-3" />
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Frequently Asked Questions
          </CardTitle>
          <CardDescription>
            Quick answers to common questions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-sm">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Contact Section */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Creche Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Contact Your Creche
            </CardTitle>
            <CardDescription>
              For billing, enrollment, and general queries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${contactInfo.creche.email}`}
                className="text-primary hover:underline"
              >
                {contactInfo.creche.email}
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a
                href={`tel:${contactInfo.creche.phone.replace(/\s/g, '')}`}
                className="text-primary hover:underline"
              >
                {contactInfo.creche.phone}
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Technical Support */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Technical Support
            </CardTitle>
            <CardDescription>
              For portal access and technical issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${contactInfo.support.email}`}
                className="text-primary hover:underline"
              >
                {contactInfo.support.email}
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{contactInfo.support.hours}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>
            Common tasks you might need help with
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" asChild className="justify-start">
              <Link href="/parent/invoices">
                <Receipt className="h-4 w-4 mr-2" />
                View Invoices
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/parent/payments">
                <Wallet className="h-4 w-4 mr-2" />
                Make Payment
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/parent/statements">
                <FileText className="h-4 w-4 mr-2" />
                View Statement
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/parent/profile">
                <User className="h-4 w-4 mr-2" />
                Update Profile
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* External Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Resources</CardTitle>
          <CardDescription>
            External links and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" asChild className="justify-start">
              <Link href="/help" target="_blank">
                <BookOpen className="h-4 w-4 mr-2" />
                Main Help Center
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/contact">
                <MessageSquare className="h-4 w-4 mr-2" />
                Contact CrecheBooks
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
