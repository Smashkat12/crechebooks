'use client';

/**
 * Year-End Review Page
 * TASK-ENROL-004: Year-End Processing Dashboard
 *
 * @description Year-end review dashboard for enrollment management:
 * - View students grouped by category (continuing/graduating/withdrawing)
 * - Identify graduation candidates (turning 6+)
 * - View account balances
 * - Process bulk graduations
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, Users, AlertTriangle, Wallet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useYearEndReview, useBulkGraduate } from '@/hooks/use-enrollments';
import type { YearEndStudent } from '@/lib/api/enrollments';

// Format currency in Rand
function formatCurrency(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(rands);
}

// Get current academic year
function getDefaultYear(): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  // If Nov or Dec, default to next year
  return currentMonth >= 10 ? now.getFullYear() + 1 : now.getFullYear();
}

// Student row component
function StudentRow({
  student,
  isSelected,
  onSelect,
}: {
  student: YearEndStudent;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  return (
    <TableRow>
      <TableCell className="w-12">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
        />
      </TableCell>
      <TableCell className="font-medium">{student.childName}</TableCell>
      <TableCell>{student.parentName}</TableCell>
      <TableCell className="text-center">
        <span className="font-semibold">{student.ageOnJan1}</span>
        {student.graduationCandidate && (
          <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700">
            <GraduationCap className="h-3 w-3 mr-1" />
            Candidate
          </Badge>
        )}
      </TableCell>
      <TableCell>{student.feeTierName}</TableCell>
      <TableCell className={student.accountBalance > 0 ? 'text-red-600' : student.accountBalance < 0 ? 'text-green-600' : ''}>
        {student.accountBalance > 0 ? (
          <span>Owes {formatCurrency(student.accountBalance)}</span>
        ) : student.accountBalance < 0 ? (
          <span>Credit {formatCurrency(Math.abs(student.accountBalance))}</span>
        ) : (
          <span className="text-muted-foreground">Paid up</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={student.currentStatus === 'ACTIVE' ? 'default' : 'secondary'}
        >
          {student.currentStatus.toLowerCase()}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// Student table component
function StudentTable({
  students,
  selectedIds,
  onSelectionChange,
  title,
  emptyMessage,
}: {
  students: YearEndStudent[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  title: string;
  emptyMessage: string;
}) {
  const allSelected = students.length > 0 && students.every(s => selectedIds.has(s.enrollmentId));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newIds = new Set(selectedIds);
      students.forEach(s => newIds.add(s.enrollmentId));
      onSelectionChange(newIds);
    } else {
      const newIds = new Set(selectedIds);
      students.forEach(s => newIds.delete(s.enrollmentId));
      onSelectionChange(newIds);
    }
  };

  const handleSelectOne = (enrollmentId: string, selected: boolean) => {
    const newIds = new Set(selectedIds);
    if (selected) {
      newIds.add(enrollmentId);
    } else {
      newIds.delete(enrollmentId);
    }
    onSelectionChange(newIds);
  };

  if (students.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            <TableHead>Child Name</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead className="text-center">Age (Jan 1)</TableHead>
            <TableHead>Fee Tier</TableHead>
            <TableHead>Account Balance</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <StudentRow
              key={student.enrollmentId}
              student={student}
              isSelected={selectedIds.has(student.enrollmentId)}
              onSelect={(selected) => handleSelectOne(student.enrollmentId, selected)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function YearEndReviewPage() {
  const { toast } = useToast();
  const [year, setYear] = React.useState<number>(getDefaultYear());
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [graduationDate, setGraduationDate] = React.useState<string>(
    `${year - 1}-12-31` // Default to Dec 31 of previous year
  );

  const { data, isLoading, isError, error, refetch } = useYearEndReview(year);
  const bulkGraduateMutation = useBulkGraduate();

  // Update graduation date when year changes
  React.useEffect(() => {
    setGraduationDate(`${year - 1}-12-31`);
    setSelectedIds(new Set());
  }, [year]);

  const handleBulkGraduate = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: 'No selection',
        description: 'Please select students to graduate',
        variant: 'destructive',
      });
      return;
    }

    try {
      const enrollmentIds = Array.from(selectedIds);
      const result = await bulkGraduateMutation.mutateAsync({
        enrollmentIds,
        endDate: graduationDate,
      });
      toast({
        title: 'Graduation complete',
        description: `Graduated ${result.graduated} student(s)${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`,
      });
      setSelectedIds(new Set());
      refetch();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to graduate students',
        variant: 'destructive',
      });
    }
  };

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/enrollments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Year-End Review</h1>
            <p className="text-muted-foreground">
              Review and process student enrollments for the academic year
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.totalActive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Continuing</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {data.summary.continuingCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Graduation Candidates</CardTitle>
              <GraduationCap className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {data.summary.graduationCandidates}
              </div>
              <p className="text-xs text-muted-foreground">Turning 6+</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(data.summary.totalOutstanding)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
              <Wallet className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(data.summary.totalCredit)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedIds.size} student(s) selected
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear selection
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm">Graduation Date:</label>
                  <input
                    type="date"
                    value={graduationDate}
                    onChange={(e) => setGraduationDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </div>
                <Button
                  onClick={handleBulkGraduate}
                  disabled={bulkGraduateMutation.isPending}
                >
                  {bulkGraduateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <GraduationCap className="h-4 w-4 mr-2" />
                  )}
                  Graduate Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading / Error States */}
      {isLoading && (
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="flex h-[400px] items-center justify-center">
          <p className="text-destructive">
            Error loading year-end review: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Student Tables */}
      {data && (
        <Tabs defaultValue="continuing" className="space-y-4">
          <TabsList>
            <TabsTrigger value="continuing">
              Continuing ({data.students.continuing.length})
            </TabsTrigger>
            <TabsTrigger value="graduating">
              Graduating ({data.students.graduating.length})
            </TabsTrigger>
            <TabsTrigger value="withdrawing">
              Withdrawing ({data.students.withdrawing.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continuing">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-600" />
                  Continuing Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StudentTable
                  students={data.students.continuing}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  title="Continuing Students"
                  emptyMessage="No continuing students for this year"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="graduating">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-orange-600" />
                  Graduating Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StudentTable
                  students={data.students.graduating}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  title="Graduating Students"
                  emptyMessage="No students marked for graduation"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawing">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Withdrawing Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StudentTable
                  students={data.students.withdrawing}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  title="Withdrawing Students"
                  emptyMessage="No students marked for withdrawal"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
