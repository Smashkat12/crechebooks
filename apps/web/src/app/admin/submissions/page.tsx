'use client';

import { AdminDashboard } from '@/components/admin/AdminDashboard';

export default function SubmissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Submissions</h1>
        <p className="text-muted-foreground">Manage contact submissions and demo requests</p>
      </div>
      <AdminDashboard />
    </div>
  );
}
