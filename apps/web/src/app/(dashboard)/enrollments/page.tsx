'use client';

/**
 * Enrollments Page
 * REQ-BILL-009: Enrollment Register UI
 *
 * @description Main page for viewing and managing child enrollments
 * Features:
 * - View all enrolled children with status
 * - Filter by enrollment status, parent, search
 * - View enrollment details (fee structure, dates, discounts)
 * - Manage enrollments (view, edit, withdraw)
 */

import { useState } from 'react';
import { UserPlus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EnrollmentTable } from '@/components/enrollments';
import { useAuth } from '@/hooks/use-auth';

export default function EnrollmentsPage() {
  const { user } = useAuth();
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);

  const handleExport = async () => {
    // TODO: Implement enrollment export to CSV
    console.log('Export enrollments');
  };

  const handleNewEnrollment = () => {
    // TODO: Open enrollment dialog
    setIsEnrollDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Enrollments</h1>
          <p className="text-muted-foreground">
            View and manage child enrollments, fee structures, and sibling discounts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={handleNewEnrollment}>
            <UserPlus className="h-4 w-4 mr-2" />
            Enroll Child
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EnrollmentTable />
        </CardContent>
      </Card>

      {/* TODO: Add enrollment dialog */}
      {/* <EnrollmentDialog
        open={isEnrollDialogOpen}
        onOpenChange={setIsEnrollDialogOpen}
      /> */}
    </div>
  );
}
