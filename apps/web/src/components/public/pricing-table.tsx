'use client';

import { Check, X, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PricingTableProps {
  billingPeriod: 'monthly' | 'annual';
}

interface FeatureRow {
  feature: string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
  category?: string;
}

const featureRows: FeatureRow[] = [
  // Children & Enrollment
  { feature: 'Maximum Children', starter: '50', professional: '150', enterprise: 'Unlimited', category: 'Children & Enrollment' },
  { feature: 'Child profiles', starter: true, professional: true, enterprise: true },
  { feature: 'Enrollment management', starter: true, professional: true, enterprise: true },
  { feature: 'Multiple locations', starter: false, professional: false, enterprise: true },

  // Financial Management
  { feature: 'Automated invoicing', starter: true, professional: true, enterprise: true, category: 'Financial Management' },
  { feature: 'Payment tracking', starter: true, professional: true, enterprise: true },
  { feature: 'Bank reconciliation', starter: true, professional: true, enterprise: true },
  { feature: 'Expense tracking', starter: false, professional: true, enterprise: true },
  { feature: 'Multi-currency', starter: false, professional: false, enterprise: true },

  // Staff Management
  { feature: 'Staff profiles', starter: true, professional: true, enterprise: true, category: 'Staff Management' },
  { feature: 'Payroll (SimplePay)', starter: false, professional: true, enterprise: true },
  { feature: 'Leave management', starter: false, professional: true, enterprise: true },
  { feature: 'Time & attendance', starter: false, professional: true, enterprise: true },

  // SARS Compliance
  { feature: 'VAT201 submissions', starter: false, professional: true, enterprise: true, category: 'SARS Compliance' },
  { feature: 'EMP201 returns', starter: false, professional: true, enterprise: true },
  { feature: 'Audit trail', starter: true, professional: true, enterprise: true },
  { feature: 'Tax certificates', starter: false, professional: true, enterprise: true },

  // Communication
  { feature: 'Email notifications', starter: true, professional: true, enterprise: true, category: 'Communication' },
  { feature: 'WhatsApp notifications', starter: false, professional: true, enterprise: true },
  { feature: 'SMS alerts', starter: false, professional: true, enterprise: true },
  { feature: 'Automated reminders', starter: true, professional: true, enterprise: true },

  // Integrations
  { feature: 'Xero integration', starter: false, professional: true, enterprise: true, category: 'Integrations' },
  { feature: 'SimplePay integration', starter: false, professional: true, enterprise: true },
  { feature: 'Banking imports', starter: true, professional: true, enterprise: true },
  { feature: 'API access', starter: false, professional: false, enterprise: true },
  { feature: 'Custom integrations', starter: false, professional: false, enterprise: true },

  // Reporting
  { feature: 'Standard reports', starter: true, professional: true, enterprise: true, category: 'Reporting & Analytics' },
  { feature: 'Financial reports', starter: true, professional: true, enterprise: true },
  { feature: 'Custom reports', starter: false, professional: false, enterprise: true },
  { feature: 'Dashboard analytics', starter: true, professional: true, enterprise: true },
  { feature: 'Export to Excel/PDF', starter: true, professional: true, enterprise: true },

  // Support
  { feature: 'Email support', starter: true, professional: true, enterprise: true, category: 'Support & Service' },
  { feature: 'Phone support', starter: false, professional: true, enterprise: true },
  { feature: 'Priority support', starter: false, professional: true, enterprise: true },
  { feature: 'Dedicated account manager', starter: false, professional: false, enterprise: true },
  { feature: 'SLA guarantee', starter: false, professional: false, enterprise: true },
  { feature: 'Onboarding assistance', starter: true, professional: true, enterprise: true },
  { feature: 'Training sessions', starter: false, professional: true, enterprise: true },
];

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  if (value) {
    return (
      <Check
        className="h-5 w-5 text-primary"
        aria-label="Included"
      />
    );
  }
  return (
    <X
      className="h-5 w-5 text-muted-foreground/50"
      aria-label="Not included"
    />
  );
}

export function PricingTable({ billingPeriod }: PricingTableProps) {
  const starterPrice = billingPeriod === 'annual' ? 'R399' : 'R499';
  const professionalPrice = billingPeriod === 'annual' ? 'R799' : 'R999';

  // Group features by category
  const categories: { name: string; features: FeatureRow[] }[] = [];
  let currentCategory: { name: string; features: FeatureRow[] } | null = null;

  featureRows.forEach((row) => {
    if (row.category) {
      if (currentCategory) {
        categories.push(currentCategory);
      }
      currentCategory = { name: row.category, features: [row] };
    } else if (currentCategory) {
      currentCategory.features.push(row);
    }
  });
  if (currentCategory) {
    categories.push(currentCategory);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="border-b">
            <th className="py-4 text-left font-semibold text-foreground">
              Features
            </th>
            <th className="px-4 py-4 text-center">
              <div className="font-semibold text-foreground">Starter</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {starterPrice}/month
              </div>
            </th>
            <th className="px-4 py-4 text-center">
              <div className="font-semibold text-primary">Professional</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {professionalPrice}/month
              </div>
            </th>
            <th className="px-4 py-4 text-center">
              <div className="font-semibold text-foreground">Enterprise</div>
              <div className="mt-1 text-sm text-muted-foreground">Custom</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <>
              <tr key={`category-${category.name}`} className="bg-muted/50">
                <td
                  colSpan={4}
                  className="py-3 px-4 text-sm font-semibold text-foreground"
                >
                  {category.name}
                </td>
              </tr>
              {category.features.map((row, index) => (
                <tr
                  key={`${category.name}-${index}`}
                  className={cn(
                    'border-b border-border/50',
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="py-3 text-sm text-muted-foreground">
                    {row.feature}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <FeatureValue value={row.starter} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center bg-primary/5">
                    <div className="flex items-center justify-center">
                      <FeatureValue value={row.professional} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <FeatureValue value={row.enterprise} />
                    </div>
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
