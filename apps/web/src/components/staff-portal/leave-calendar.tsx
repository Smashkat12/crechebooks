'use client';

/**
 * Leave Calendar Component
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Calendar view showing:
 * - Scheduled leave dates
 * - Pending leave requests
 * - Color-coded by status
 * - Month navigation
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  addMonths,
  subMonths,
  getDay,
  isToday,
  parseISO,
} from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveEvent {
  id: string;
  type: string;
  typeName: string;
  startDate: Date | string;
  endDate: Date | string;
  status: LeaveStatus;
}

export interface LeaveCalendarProps {
  events: LeaveEvent[];
  className?: string;
  onDateClick?: (date: Date, events: LeaveEvent[]) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

const parseDate = (date: Date | string): Date => {
  if (typeof date === 'string') {
    return parseISO(date);
  }
  return date;
};

const getStatusColor = (status: LeaveStatus): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700';
    case 'approved':
      return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700';
    case 'rejected':
      return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';
    case 'cancelled':
      return 'bg-gray-100 dark:bg-gray-800/30 border-gray-300 dark:border-gray-600';
  }
};

const getStatusDotColor = (status: LeaveStatus): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500';
    case 'approved':
      return 'bg-green-500';
    case 'rejected':
      return 'bg-red-500';
    case 'cancelled':
      return 'bg-gray-400';
  }
};

// ============================================================================
// Day Cell Component
// ============================================================================

interface DayCellProps {
  date: Date;
  currentMonth: Date;
  events: LeaveEvent[];
  onClick?: () => void;
}

function DayCell({ date, currentMonth, events, onClick }: DayCellProps) {
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isCurrentDay = isToday(date);

  // Get the highest priority event for display
  const priorityOrder: LeaveStatus[] = ['approved', 'pending', 'rejected', 'cancelled'];
  const sortedEvents = [...events].sort(
    (a, b) => priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status)
  );
  const primaryEvent = sortedEvents[0];

  return (
    <button
      onClick={onClick}
      disabled={!isCurrentMonth}
      className={cn(
        'relative h-10 sm:h-12 w-full p-1 text-sm rounded-md transition-colors',
        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        !isCurrentMonth && 'text-muted-foreground/30 cursor-default',
        isCurrentDay && 'font-bold',
        primaryEvent && isCurrentMonth && getStatusColor(primaryEvent.status)
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1/2 -translate-x-1/2 sm:top-1.5',
          isCurrentDay &&
            'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
        )}
      >
        {format(date, 'd')}
      </span>
      {events.length > 0 && isCurrentMonth && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {events.slice(0, 3).map((event) => (
            <span
              key={event.id}
              className={cn('w-1.5 h-1.5 rounded-full', getStatusDotColor(event.status))}
            />
          ))}
          {events.length > 3 && (
            <span className="text-[8px] text-muted-foreground">+{events.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// Calendar Legend
// ============================================================================

function CalendarLegend() {
  const statuses: { status: LeaveStatus; label: string }[] = [
    { status: 'approved', label: 'Approved' },
    { status: 'pending', label: 'Pending' },
    { status: 'rejected', label: 'Rejected' },
    { status: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {statuses.map(({ status, label }) => (
        <div key={status} className="flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-full', getStatusDotColor(status))} />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LeaveCalendar({ events, className, onDateClick }: LeaveCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Get all days in the current month view (including padding days)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Add padding days at the start (Sunday = 0)
    const startPadding = getDay(monthStart);
    const paddingStart = Array.from({ length: startPadding }, (_, i) => {
      const date = new Date(monthStart);
      date.setDate(date.getDate() - (startPadding - i));
      return date;
    });

    // Add padding days at the end to complete the grid (6 rows x 7 days = 42)
    const totalDays = paddingStart.length + days.length;
    const endPadding = Array.from({ length: 42 - totalDays }, (_, i) => {
      const date = new Date(monthEnd);
      date.setDate(date.getDate() + i + 1);
      return date;
    });

    return [...paddingStart, ...days, ...endPadding];
  }, [currentMonth]);

  // Get events for a specific date
  const getEventsForDate = (date: Date): LeaveEvent[] => {
    return events.filter((event) => {
      const start = parseDate(event.startDate);
      const end = parseDate(event.endDate);
      // Only show non-cancelled and non-rejected events on calendar
      if (event.status === 'cancelled' || event.status === 'rejected') {
        return false;
      }
      return isWithinInterval(date, { start, end }) || isSameDay(date, start) || isSameDay(date, end);
    });
  };

  // Navigation handlers
  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // Day names
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Leave Calendar
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday} className="px-3">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm font-medium">{format(currentMonth, 'MMMM yyyy')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {dayNames.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, index) => {
            const dateEvents = getEventsForDate(date);
            return (
              <DayCell
                key={index}
                date={date}
                currentMonth={currentMonth}
                events={dateEvents}
                onClick={
                  onDateClick && isSameMonth(date, currentMonth)
                    ? () => onDateClick(date, dateEvents)
                    : undefined
                }
              />
            );
          })}
        </div>

        {/* Legend */}
        <CalendarLegend />

        {/* Upcoming Leave Summary */}
        {events.filter((e) => e.status === 'approved' || e.status === 'pending').length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-2">Upcoming Leave</h4>
            <div className="space-y-2">
              {events
                .filter((e) => e.status === 'approved' || e.status === 'pending')
                .filter((e) => parseDate(e.startDate) >= new Date())
                .slice(0, 3)
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
                  >
                    <div>
                      <span className="font-medium">{event.typeName}</span>
                      <span className="text-muted-foreground ml-2">
                        {format(parseDate(event.startDate), 'd MMM')} -{' '}
                        {format(parseDate(event.endDate), 'd MMM')}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        event.status === 'approved'
                          ? 'border-green-300 text-green-700'
                          : 'border-yellow-300 text-yellow-700'
                      )}
                    >
                      {event.status}
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LeaveCalendar;
