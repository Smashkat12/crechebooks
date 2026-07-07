"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useParent } from "@/hooks/use-parents";
import { useSendReminder } from "@/hooks/use-arrears";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";

const reminderSchema = z.object({
  message: z.string().min(10, "Message must be at least 10 characters"),
  sendEmail: z.boolean(),
  sendWhatsApp: z.boolean(),
}).refine((data) => data.sendEmail || data.sendWhatsApp, {
  message: "Select at least one delivery method",
  path: ["sendEmail"],
});

type ReminderFormValues = z.infer<typeof reminderSchema>;

const DEFAULT_REMINDER_MESSAGE = `Dear [Parent Name],

This is a friendly reminder that you have outstanding invoices with us. Please review your account and make payment at your earliest convenience.

If you have any questions or concerns, please don't hesitate to contact us.

Thank you for your prompt attention to this matter.

Best regards,
[Creche Name]`;

function resolveReminderTemplate(
  template: string,
  parentName: string,
  crecheName: string
): string {
  return template
    .replace("[Parent Name]", parentName)
    .replace("[Creche Name]", crecheName);
}

interface SendReminderDialogProps {
  parentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendReminderDialog({
  parentId,
  open,
  onOpenChange,
}: SendReminderDialogProps) {
  const { toast } = useToast();
  const { data: parent, isLoading } = useParent(parentId ?? "");
  const { data: tenant } = useTenant();
  const sendReminder = useSendReminder();
  const isSubmitting = sendReminder.isPending;

  const form = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      message: DEFAULT_REMINDER_MESSAGE,
      sendEmail: true,
      sendWhatsApp: false,
    },
  });

  const crecheName = tenant?.tradingName || tenant?.name || "Your Creche";

  // Pre-resolve the placeholder tokens in the default message once the
  // parent (and tenant) data has loaded, so users see the real message
  // they're about to send rather than literal `[Parent Name]` / `[Creche
  // Name]` tokens. Skipped once the user has started editing the message
  // themselves so we never clobber their edits.
  useEffect(() => {
    if (!open || !parent) return;
    const isMessageDirty = form.getFieldState("message", form.formState).isDirty;
    if (isMessageDirty) return;

    const parentName = `${parent.firstName} ${parent.lastName}`;
    form.setValue(
      "message",
      resolveReminderTemplate(DEFAULT_REMINDER_MESSAGE, parentName, crecheName)
    );
  }, [open, parent, crecheName, form]);

  const onSubmit = async (data: ReminderFormValues) => {
    if (!parentId || !parent) return;

    const parentName = `${parent.firstName} ${parent.lastName}`;
    const personalizedMessage = resolveReminderTemplate(data.message, parentName, crecheName);

    const method =
      data.sendEmail && data.sendWhatsApp
        ? "both"
        : data.sendWhatsApp
        ? "whatsapp"
        : "email";

    try {
      await sendReminder.mutateAsync({
        parentIds: [parentId],
        method,
        template: personalizedMessage,
      });

      toast({
        title: "Reminder Sent",
        description: `Payment reminder sent to ${parent.firstName} ${parent.lastName} via ${
          data.sendEmail && data.sendWhatsApp
            ? "email and WhatsApp"
            : data.sendEmail
            ? "email"
            : "WhatsApp"
        }`,
      });

      onOpenChange(false);
      form.reset();
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to send reminder. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!parentId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Payment Reminder</DialogTitle>
          <DialogDescription>
            {isLoading ? (
              <span className="inline-block h-4 w-48 animate-pulse rounded-md bg-primary/10" />
            ) : parent ? (
              `Send a payment reminder to ${parent.firstName} ${parent.lastName}`
            ) : (
              "Send a payment reminder"
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter reminder message..."
                      className="min-h-[200px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use [Parent Name] and [Creche Name] as placeholders
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Delivery Methods</FormLabel>
              <FormField
                control={form.control}
                name="sendEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        Send via Email
                      </FormLabel>
                      {parent?.email && (
                        <FormDescription className="text-xs">
                          {parent.email}
                        </FormDescription>
                      )}
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sendWhatsApp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!parent?.phone}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        Send via WhatsApp
                      </FormLabel>
                      {parent?.phone ? (
                        <FormDescription className="text-xs">
                          {parent.phone}
                        </FormDescription>
                      ) : (
                        <FormDescription className="text-xs text-muted-foreground">
                          No phone number available
                        </FormDescription>
                      )}
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Reminder"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
