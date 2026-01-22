'use client';

import { useRouter } from 'next/navigation';
import {
  FileText,
  CreditCard,
  Receipt,
  User,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuickAction {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const actions: QuickAction[] = [
  {
    title: 'View Invoices',
    description: 'See all your invoices',
    icon: FileText,
    href: '/parent/invoices',
  },
  {
    title: 'Make Payment',
    description: 'Pay outstanding balance',
    icon: CreditCard,
    href: '/parent/payments',
  },
  {
    title: 'View Statements',
    description: 'Download monthly statements',
    icon: Receipt,
    href: '/parent/statements',
  },
  {
    title: 'Update Profile',
    description: 'Manage your account',
    icon: User,
    href: '/parent/profile',
  },
];

export function QuickActions() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <div
              key={action.href}
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => router.push(action.href)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{action.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
