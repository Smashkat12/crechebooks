'use client';

import { use } from 'react';
import { ArrowLeft, Edit, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useParent, useParentChildren } from '@/hooks/use-parents';
import { Skeleton } from '@/components/ui/skeleton';
import { EnrollmentStatus } from '@crechebooks/types';

interface ParentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ParentDetailPage({ params }: ParentDetailPageProps) {
  const { id } = use(params);
  const { data: parent, isLoading, error } = useParent(id);
  const { data: children } = useParentChildren(id);

  if (error) {
    throw new Error(`Failed to load parent: ${error.message}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!parent) {
    throw new Error('Parent not found');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/parents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {parent.firstName} {parent.lastName}
            </h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {parent.email}
              </span>
              {parent.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {parent.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link href={`/parents/${id}/edit`}>
          <Button variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{parent.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{parent.phone ?? 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium">{parent.address ?? 'Not provided'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Children ({children?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {children && children.length > 0 ? (
              <div className="space-y-3">
                {children.map((child) => (
                  <div key={child.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{child.firstName} {child.lastName}</p>
                      <p className="text-sm text-muted-foreground">
                        DOB: {new Date(child.dateOfBirth).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <Badge variant={child.status === EnrollmentStatus.ACTIVE ? 'default' : 'secondary'}>
                      {child.status === EnrollmentStatus.ACTIVE ? 'Enrolled' : child.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No children registered</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
