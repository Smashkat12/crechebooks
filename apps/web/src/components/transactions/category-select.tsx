/**
 * Category Select Component
 *
 * Dropdown for selecting transaction categories from Chart of Accounts.
 * Groups categories by type (income/expense) and supports search.
 */

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

// Chart of Accounts categories
const INCOME_CATEGORIES = [
  { code: '4000', name: 'Fee Income' },
  { code: '4100', name: 'Enrollment Fees' },
  { code: '4200', name: 'Activity Fees' },
  { code: '4900', name: 'Other Income' },
];

const EXPENSE_CATEGORIES = [
  { code: '5000', name: 'Salaries and Wages' },
  { code: '5100', name: 'Staff Benefits' },
  { code: '5200', name: 'Facility Costs' },
  { code: '5300', name: 'Learning Materials' },
  { code: '5400', name: 'Food and Nutrition' },
  { code: '5500', name: 'Utilities' },
  { code: '5600', name: 'Administrative' },
  { code: '5700', name: 'Professional Services' },
  { code: '5800', name: 'Taxes and Licenses' },
  { code: '5900', name: 'Other Expenses' },
];

interface CategorySelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select category...',
}: CategorySelectProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filterCategories = (categories: typeof INCOME_CATEGORIES) => {
    if (!searchQuery) return categories;

    const query = searchQuery.toLowerCase();
    return categories.filter(
      cat =>
        cat.name.toLowerCase().includes(query) ||
        cat.code.includes(query)
    );
  };

  const filteredIncome = filterCategories(INCOME_CATEGORIES);
  const filteredExpenses = filterCategories(EXPENSE_CATEGORIES);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div className="flex items-center border-b px-3 pb-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 border-0 p-0 focus-visible:ring-0"
          />
        </div>

        {filteredIncome.length > 0 && (
          <SelectGroup>
            <SelectLabel>Income</SelectLabel>
            {filteredIncome.map((category) => (
              <SelectItem key={category.code} value={category.code}>
                {category.code} - {category.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredExpenses.length > 0 && (
          <SelectGroup>
            <SelectLabel>Expenses</SelectLabel>
            {filteredExpenses.map((category) => (
              <SelectItem key={category.code} value={category.code}>
                {category.code} - {category.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredIncome.length === 0 && filteredExpenses.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No categories found
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
