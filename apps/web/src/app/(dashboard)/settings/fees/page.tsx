'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function FeeStructuresSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Fee Structures</CardTitle>
            <CardDescription>
              Manage monthly fees for different enrollment types
            </CardDescription>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Fee Structure
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          No fee structures defined. Add one to get started.
        </div>
      </CardContent>
    </Card>
  );
}
