'use client';

import { Baby, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Child {
  id: string;
  name: string;
  dateOfBirth?: string;
  enrollmentStatus: 'active' | 'pending' | 'inactive';
  className?: string;
}

interface ChildrenSummaryProps {
  enrolledChildren: Child[];
}

const statusConfig: Record<
  Child['enrollmentStatus'],
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  active: { label: 'Active', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  inactive: { label: 'Inactive', variant: 'secondary' },
};

function calculateAge(dateOfBirth: string): string {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  const years = today.getFullYear() - birth.getFullYear();
  const months = today.getMonth() - birth.getMonth();

  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }

  if (months < 0) {
    return `${years - 1} year${years - 1 !== 1 ? 's' : ''}`;
  }

  return `${years} year${years !== 1 ? 's' : ''}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ChildrenSummary({ enrolledChildren }: ChildrenSummaryProps) {
  if (enrolledChildren.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Baby className="h-5 w-5" />
            Your Children
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Baby className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No children enrolled</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Baby className="h-5 w-5" />
          Your Children ({enrolledChildren.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {enrolledChildren.map((child) => {
            const status = statusConfig[child.enrollmentStatus];
            return (
              <div
                key={child.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getInitials(child.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{child.name}</h4>
                    <Badge variant={status.variant} className="text-xs">
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {child.dateOfBirth && (
                      <span>{calculateAge(child.dateOfBirth)}</span>
                    )}
                    {child.className && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          {child.className}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
