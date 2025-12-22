'use client';

import {
  FileText,
  CreditCard,
  Upload,
  Users,
  FileBarChart,
  Calculator,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

const actions: QuickAction[] = [
  {
    label: 'Generate Invoices',
    href: '/invoices/generate',
    icon: FileText,
    description: 'Create monthly invoices',
  },
  {
    label: 'Match Payments',
    href: '/payments',
    icon: CreditCard,
    description: 'AI-assisted matching',
  },
  {
    label: 'Import Transactions',
    href: '/transactions/import',
    icon: Upload,
    description: 'Upload bank statement',
  },
  {
    label: 'Manage Children',
    href: '/parents',
    icon: Users,
    description: 'Enrollments & fees',
  },
  {
    label: 'View Reports',
    href: '/reports',
    icon: FileBarChart,
    description: 'Financial reports',
  },
  {
    label: 'SARS Returns',
    href: '/sars',
    icon: Calculator,
    description: 'VAT & PAYE submissions',
  },
];

interface QuickActionsProps {
  className?: string;
}

export function QuickActions({ className }: QuickActionsProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href}>
                <Button
                  variant="outline"
                  className="w-full h-auto flex-col items-start p-4 hover:bg-accent"
                >
                  <Icon className="h-5 w-5 mb-2 text-primary" />
                  <span className="font-medium text-sm">{action.label}</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {action.description}
                  </span>
                </Button>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
