'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Calendar, User, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface EmploymentCardProps {
  position: string;
  department?: string;
  startDate: Date | string;
  status: 'active' | 'probation' | 'terminated';
  employeeNumber?: string;
}

export function EmploymentCard({
  position,
  department,
  startDate,
  status,
  employeeNumber,
}: EmploymentCardProps) {
  const statusColors = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    probation: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    terminated: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  const statusLabels = {
    active: 'Active',
    probation: 'Probation',
    terminated: 'Terminated',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Employment Status</CardTitle>
          <Badge className={statusColors[status]}>{statusLabels[status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{position}</p>
            <p className="text-xs text-muted-foreground">Position</p>
          </div>
        </div>
        {department && (
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{department}</p>
              <p className="text-xs text-muted-foreground">Department</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {format(new Date(startDate), 'dd MMM yyyy')}
            </p>
            <p className="text-xs text-muted-foreground">Start Date</p>
          </div>
        </div>
        {employeeNumber && (
          <div className="flex items-center gap-3">
            <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{employeeNumber}</p>
              <p className="text-xs text-muted-foreground">Employee Number</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
