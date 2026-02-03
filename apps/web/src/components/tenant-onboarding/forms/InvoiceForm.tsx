'use client';

/**
 * First Invoice Inline Form
 * TASK-ACCT-UI-006: Inline form for onboarding wizard
 */

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useEnrollments } from '@/hooks/use-enrollments';
import { useInvoicesList, useGenerateInvoices, useSendInvoices } from '@/hooks/use-invoices';
import { useToast } from '@/hooks/use-toast';

const invoiceSchema = z.object({
  childId: z.string().optional(),
  sendAfterGenerate: z.boolean(),
  deliveryMethod: z.enum(['email', 'whatsapp', 'both']),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function InvoiceForm({ onComplete, onCancel }: InvoiceFormProps) {
  const { toast } = useToast();
  const [generatedInvoiceIds, setGeneratedInvoiceIds] = useState<string[]>([]);

  const { data: enrollments, isLoading: enrollmentsLoading } = useEnrollments({ status: 'active' });
  const { data: invoices, isLoading: invoicesLoading } = useInvoicesList({ limit: 10 });
  const generateInvoices = useGenerateInvoices();
  const sendInvoices = useSendInvoices();

  const hasEnrollments = enrollments && enrollments.enrollments && enrollments.enrollments.length > 0;
  const hasInvoices = invoices && invoices.invoices && invoices.invoices.length > 0;

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      childId: undefined,
      sendAfterGenerate: true,
      deliveryMethod: 'email',
    },
  });

  const sendAfterGenerate = watch('sendAfterGenerate');

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      // Get current month/year
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Generate invoices
      const result = await generateInvoices.mutateAsync({
        month,
        year,
        childIds: data.childId ? [data.childId] : undefined,
      });

      if (result.count === 0) {
        toast({
          title: 'No invoices generated',
          description: 'Invoices may already exist for this period.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Invoices generated',
        description: `${result.count} invoice(s) created successfully.`,
      });

      // If send option is enabled, send the invoices
      if (data.sendAfterGenerate && generatedInvoiceIds.length > 0) {
        try {
          await sendInvoices.mutateAsync({
            invoiceIds: generatedInvoiceIds,
            method: data.deliveryMethod,
          });
          toast({
            title: 'Invoices sent',
            description: 'Invoice(s) have been sent to parents.',
          });
        } catch {
          toast({
            title: 'Warning',
            description: 'Invoices generated but failed to send. You can send them manually.',
            variant: 'destructive',
          });
        }
      }

      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to generate invoices. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (enrollmentsLoading || invoicesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If already has invoices, show success
  if (hasInvoices) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              You already have {invoices.invoices.length} invoice(s) created.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // Check if no enrollments
  if (!hasEnrollments) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-700">
            You need to enrol at least one child before generating invoices.
            Please complete the Enrol Child step first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Generate your first invoice</p>
              <p className="text-sm text-blue-700 mt-1">
                This will create invoices for all active enrollments for the current month.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="childId">Generate for (optional)</Label>
          <Controller
            name="childId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="All enrolled children" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All enrolled children</SelectItem>
                  {enrollments?.enrollments?.map((enrollment) => (
                    <SelectItem key={enrollment.child_id} value={enrollment.child_id}>
                      {enrollment.child_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to generate for all enrolled children
          </p>
        </div>

        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label htmlFor="sendAfterGenerate" className="cursor-pointer">
                Send after generating
              </Label>
              <p className="text-xs text-muted-foreground">
                Email invoices to parents immediately
              </p>
            </div>
          </div>
          <Controller
            name="sendAfterGenerate"
            control={control}
            render={({ field }) => (
              <Switch
                id="sendAfterGenerate"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        {sendAfterGenerate && (
          <div className="space-y-2">
            <Label htmlFor="deliveryMethod">Delivery Method</Label>
            <Controller
              name="deliveryMethod"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email Only</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
                    <SelectItem value="both">Both Email & WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        Invoices will be generated for the current billing month ({new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}).
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || generateInvoices.isPending}>
          {(isSubmitting || generateInvoices.isPending) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Generate & Complete
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default InvoiceForm;
