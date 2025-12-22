'use client';

import { format } from 'date-fns';
import { Edit, Calendar, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EnrollmentStatus } from './enrollment-status';
import type { IChild } from '@crechebooks/types';

interface ChildrenListProps {
  items: IChild[];
  onEdit?: (child: IChild) => void;
  onViewEnrollment?: (child: IChild) => void;
}

function calculateAge(dateOfBirth: Date): string {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  return `${years} year${years !== 1 ? 's' : ''} ${months > 0 ? `${months}m` : ''}`;
}

export function ChildrenList({ items, onEdit, onViewEnrollment: _onViewEnrollment }: ChildrenListProps) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <GraduationCap className="mx-auto h-12 w-12 mb-2 opacity-50" />
        <p>No children enrolled yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((child) => (
        <Card key={child.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">
                  {child.firstName} {child.lastName}
                </h4>
                <EnrollmentStatus status={child.status} />
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Born: {format(new Date(child.dateOfBirth), 'dd MMM yyyy')}
                </span>
                <span>Age: {calculateAge(new Date(child.dateOfBirth))}</span>
                <span>
                  Enrolled: {format(new Date(child.enrollmentDate), 'dd MMM yyyy')}
                </span>
              </div>
              {child.notes && (
                <p className="mt-1 text-sm text-muted-foreground">{child.notes}</p>
              )}
            </div>
            <div className="flex gap-2">
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={() => onEdit(child)}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
