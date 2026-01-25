'use client';

/**
 * Staff Portal Help Page
 * Help and support resources for staff members
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
  CreditCard,
  Calendar,
  User,
  ChevronRight,
  Search,
  ExternalLink,
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
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Payslips',
    description: 'View and download your payslips',
    links: [
      { title: 'How to view my payslip', href: '#payslips-view' },
      { title: 'Understanding payslip deductions', href: '#payslips-deductions' },
      { title: 'Downloading payslip PDF', href: '#payslips-download' },
    ],
  },
  {
    icon: <Calendar className="h-5 w-5" />,
    title: 'Leave Management',
    description: 'Request and track your leave',
    links: [
      { title: 'How to request leave', href: '#leave-request' },
      { title: 'Checking leave balance', href: '#leave-balance' },
      { title: 'Leave types explained', href: '#leave-types' },
    ],
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Tax Documents',
    description: 'Access your IRP5 and tax certificates',
    links: [
      { title: 'Downloading your IRP5', href: '#tax-irp5' },
      { title: 'Understanding your tax certificate', href: '#tax-certificate' },
      { title: 'Tax year documents', href: '#tax-years' },
    ],
  },
  {
    icon: <User className="h-5 w-5" />,
    title: 'Profile & Settings',
    description: 'Update your personal information',
    links: [
      { title: 'Updating contact details', href: '#profile-contact' },
      { title: 'Emergency contacts', href: '#profile-emergency' },
      { title: 'Notification preferences', href: '#profile-notifications' },
    ],
  },
];

const faqs = [
  {
    question: 'How do I access my payslips?',
    answer:
      'Navigate to "Payslips" from the main menu. You\'ll see a list of all your payslips organized by month. Click on any payslip to view details or download a PDF copy.',
  },
  {
    question: 'How do I request leave?',
    answer:
      'Go to "Leave" in the main menu, then click "Request Leave". Select the leave type, choose your dates, and add any notes. Your request will be sent to your manager for approval.',
  },
  {
    question: 'Where can I find my IRP5?',
    answer:
      'Your IRP5 tax certificates are available under "Tax Documents". Select the relevant tax year to view or download your IRP5. These are typically available after the end of each tax year (February).',
  },
  {
    question: 'How do I update my banking details?',
    answer:
      'For security reasons, banking details can only be updated through HR. Please contact your HR department or manager to request a banking details change. You\'ll need to provide supporting documentation.',
  },
  {
    question: 'Can I update my emergency contact information?',
    answer:
      'Yes! Go to "Profile" and scroll to the Emergency Contact section. You can update your emergency contact name, relationship, and phone numbers directly from the portal.',
  },
  {
    question: 'Who do I contact for payroll queries?',
    answer:
      'For any payroll-related queries, please contact your HR department or the payroll team. You can find their contact details below or reach out to your direct manager.',
  },
];

const contactInfo = {
  hr: {
    email: 'hr@example.com',
    phone: '+27 11 123 4567',
  },
  support: {
    email: 'support@crechebooks.co.za',
    hours: 'Mon-Fri 8am-5pm SAST',
  },
};

export default function StaffHelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <HelpCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
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
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
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
                      className="text-sm text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1"
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
        {/* HR Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              HR Department
            </CardTitle>
            <CardDescription>
              For payroll, leave, and employment queries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${contactInfo.hr.email}`}
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {contactInfo.hr.email}
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a
                href={`tel:${contactInfo.hr.phone.replace(/\s/g, '')}`}
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {contactInfo.hr.phone}
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
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
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
                Contact Us
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
