'use client';

/**
 * Child Card Component
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * Displays child information:
 * - Child name
 * - Date of birth
 * - Enrollment date
 * - Class/group assignment
 * - Attendance type (full day, half day)
 * - Photo placeholder
 */

import { Baby, Calendar, GraduationCap, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDate } from '@/lib/utils';
import type { ParentChild } from '@/hooks/parent-portal/use-parent-profile';

interface ChildCardProps {
  child: ParentChild;
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): string {
  const birth = new Date(dateOfBirth);
  const today = new Date();

  const years = today.getFullYear() - birth.getFullYear();
  const months = today.getMonth() - birth.getMonth();

  let adjustedYears = years;
  let adjustedMonths = months;

  if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
    adjustedYears--;
    adjustedMonths = months + 12;
  }

  if (adjustedYears === 0) {
    return `${adjustedMonths} month${adjustedMonths !== 1 ? 's' : ''}`;
  }

  if (adjustedMonths === 0) {
    return `${adjustedYears} year${adjustedYears !== 1 ? 's' : ''}`;
  }

  return `${adjustedYears}y ${adjustedMonths}m`;
}

/**
 * Get initials from name
 */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

/**
 * Get attendance type label and variant
 */
function getAttendanceConfig(type: ParentChild['attendanceType']): {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
} {
  switch (type) {
    case 'full_day':
      return { label: 'Full Day', variant: 'default' };
    case 'half_day':
      return { label: 'Half Day', variant: 'secondary' };
    case 'after_care':
      return { label: 'After Care', variant: 'outline' };
    default:
      return { label: type || 'Unknown', variant: 'outline' };
  }
}

export function ChildCard({ child }: ChildCardProps) {
  const age = child.dateOfBirth ? calculateAge(child.dateOfBirth) : null;
  const attendanceConfig = getAttendanceConfig(child.attendanceType);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-16 w-16 ring-2 ring-primary/10">
            {child.photoUrl ? (
              <AvatarImage
                src={child.photoUrl}
                alt={`${child.firstName} ${child.lastName}`}
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
              {getInitials(child.firstName, child.lastName)}
            </AvatarFallback>
          </Avatar>

          {/* Main Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-lg font-semibold truncate">
                {child.firstName} {child.lastName}
              </h3>
              <Badge
                variant={child.isActive ? 'success' : 'secondary'}
                className="shrink-0"
              >
                {child.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            {/* Age */}
            {age && (
              <p className="text-sm text-muted-foreground mt-1">
                {age} old
              </p>
            )}
          </div>
        </div>

        {/* Details Grid */}
        <div className="mt-4 grid gap-3">
          {/* Date of Birth */}
          {child.dateOfBirth && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Born:</span>
              <span className="font-medium">{formatDate(child.dateOfBirth)}</span>
            </div>
          )}

          {/* Enrollment Date */}
          {child.enrollmentDate && (
            <div className="flex items-center gap-2 text-sm">
              <Baby className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Enrolled:</span>
              <span className="font-medium">{formatDate(child.enrollmentDate)}</span>
            </div>
          )}

          {/* Class */}
          {child.className && (
            <div className="flex items-center gap-2 text-sm">
              <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Class:</span>
              <span className="font-medium">{child.className}</span>
            </div>
          )}

          {/* Attendance Type */}
          {child.attendanceType && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Attendance:</span>
              <Badge variant={attendanceConfig.variant} className="text-xs">
                {attendanceConfig.label}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
