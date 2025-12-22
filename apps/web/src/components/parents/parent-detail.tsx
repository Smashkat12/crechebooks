'use client';

import { useState } from 'react';
import { Mail, Phone, MapPin, MessageCircle, Edit, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChildrenList } from './children-list';
import { ParentForm } from './parent-form';
import { ChildForm } from './child-form';
import { CommunicationMethod, EnrollmentStatus } from '@crechebooks/types';
import type { IParent, IChild } from '@crechebooks/types';

interface ParentDetailProps {
  parent: IParent;
  children: IChild[];
  onUpdateParent: (data: Partial<IParent>) => Promise<void>;
  onAddChild: (data: Partial<IChild>) => Promise<void>;
  onUpdateChild: (childId: string, data: Partial<IChild>) => Promise<void>;
  isLoading?: boolean;
}

const communicationLabels: Record<CommunicationMethod, { label: string; icon: React.ElementType }> = {
  EMAIL: { label: 'Email', icon: Mail },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle },
  BOTH: { label: 'Email & WhatsApp', icon: MessageCircle },
};

export function ParentDetail({
  parent,
  children,
  onUpdateParent,
  onAddChild,
  onUpdateChild,
  isLoading = false,
}: ParentDetailProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);

  const commPref = communicationLabels[parent.preferredCommunication];
  const CommIcon = commPref.icon;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                {parent.firstName} {parent.lastName}
              </CardTitle>
              <CardDescription>Parent Details</CardDescription>
            </div>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Parent</DialogTitle>
                </DialogHeader>
                <ParentForm
                  parent={parent}
                  onSave={async (data) => {
                    await onUpdateParent({
                      ...data,
                      preferredCommunication: data.preferredCommunication as CommunicationMethod,
                    });
                    setIsEditOpen(false);
                  }}
                  onCancel={() => setIsEditOpen(false)}
                  isLoading={isLoading}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{parent.email}</span>
            </div>
            {parent.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{parent.phone}</span>
              </div>
            )}
            {parent.whatsappNumber && (
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span>{parent.whatsappNumber}</span>
              </div>
            )}
            {parent.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{parent.address}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <CommIcon className="mr-1 h-3 w-3" />
              {commPref.label}
            </Badge>
            <Badge variant="secondary">
              {children.length} {children.length === 1 ? 'child' : 'children'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Children</CardTitle>
              <CardDescription>Enrolled children and their fee structures</CardDescription>
            </div>
            <Dialog open={isAddChildOpen} onOpenChange={setIsAddChildOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Child
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Child</DialogTitle>
                </DialogHeader>
                <ChildForm
                  parentId={parent.id}
                  onSave={async (data) => {
                    await onAddChild({
                      ...data,
                      status: data.status as EnrollmentStatus,
                    });
                    setIsAddChildOpen(false);
                  }}
                  onCancel={() => setIsAddChildOpen(false)}
                  isLoading={isLoading}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <ChildrenList
            items={children}
            onEdit={(child) => onUpdateChild(child.id, child)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
