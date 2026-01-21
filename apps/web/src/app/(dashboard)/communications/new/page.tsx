'use client';

/**
 * New Broadcast Page
 * TASK-COMM-004: Frontend Communication Dashboard
 *
 * 3-step wizard for creating and sending broadcast messages.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Send, Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MessageComposer } from '@/components/communications/message-composer';
import { ChannelSelector } from '@/components/communications/channel-selector';
import { RecipientSelector } from '@/components/communications/recipient-selector';
import { RecipientPreview } from '@/components/communications/recipient-preview';
import { useCommunications, CreateBroadcastDto } from '@/hooks/use-communications';
import { useToast } from '@/hooks/use-toast';

// Step indicator component
function StepIndicator({
  currentStep,
  steps
}: {
  currentStep: number;
  steps: string[]
}) {
  return (
    <div className="flex items-center justify-center space-x-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
              index + 1 < currentStep
                ? 'border-primary bg-primary text-primary-foreground'
                : index + 1 === currentStep
                ? 'border-primary text-primary'
                : 'border-muted text-muted-foreground'
            }`}
          >
            {index + 1 < currentStep ? (
              <Check className="h-4 w-4" />
            ) : (
              <span className="text-sm font-medium">{index + 1}</span>
            )}
          </div>
          <span
            className={`ml-2 text-sm ${
              index + 1 <= currentStep ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {step}
          </span>
          {index < steps.length - 1 && (
            <div
              className={`ml-4 h-0.5 w-12 ${
                index + 1 < currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Broadcast preview component
function BroadcastPreview({
  data,
}: {
  data: {
    recipientType: string;
    channel: string;
    subject: string;
    body: string;
  };
}) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Recipients</p>
          <p className="capitalize">{data.recipientType}s</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Channel</p>
          <p className="capitalize">{data.channel}</p>
        </div>
      </div>
      {data.subject && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Subject</p>
          <p>{data.subject}</p>
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-muted-foreground">Message</p>
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-4">
          {data.body}
        </div>
      </div>
    </div>
  );
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const { createBroadcast, sendBroadcast, isCreating, isSending } = useCommunications();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    recipientType: 'parent',
    recipientFilter: {} as Record<string, unknown>,
    channel: 'email',
    subject: '',
    body: '',
  });

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const canProceedToStep2 = formData.recipientType && formData.channel;
  const canProceedToStep3 = canProceedToStep2 && formData.body.trim().length > 0;

  const handleCreate = async () => {
    try {
      const dto: CreateBroadcastDto = {
        recipient_type: formData.recipientType as 'parent' | 'staff' | 'custom',
        channel: formData.channel as 'email' | 'whatsapp' | 'sms' | 'all',
        subject: formData.subject || undefined,
        body: formData.body,
      };
      const broadcast = await createBroadcast(dto);
      toast({ title: 'Message saved as draft' });
      router.push(`/communications/${broadcast.id}`);
    } catch {
      toast({ title: 'Failed to create message', variant: 'destructive' });
    }
  };

  const handleSendNow = async () => {
    try {
      const dto: CreateBroadcastDto = {
        recipient_type: formData.recipientType as 'parent' | 'staff' | 'custom',
        channel: formData.channel as 'email' | 'whatsapp' | 'sms' | 'all',
        subject: formData.subject || undefined,
        body: formData.body,
      };
      const broadcast = await createBroadcast(dto);
      await sendBroadcast(broadcast.id);
      toast({ title: 'Message sent successfully' });
      router.push('/communications');
    } catch {
      toast({ title: 'Failed to send message', variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/communications')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Communications
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">New Message</h1>
          <p className="text-muted-foreground">
            Compose and send a message to parents or staff
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} steps={['Recipients', 'Message', 'Review']} />

      {/* Step 1: Recipients */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Recipients</CardTitle>
            <CardDescription>
              Choose who will receive this message
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RecipientSelector
              value={formData}
              onChange={updateFormData}
            />
            <ChannelSelector
              value={formData.channel}
              onChange={(channel) => updateFormData({ channel })}
            />
            <RecipientPreview
              recipientType={formData.recipientType}
              channel={formData.channel}
              filter={formData.recipientFilter}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canProceedToStep2}>
                Continue to Message
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Message */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Compose Message</CardTitle>
            <CardDescription>
              Write your message content
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <MessageComposer
              value={formData}
              onChange={updateFormData}
              showSubject={formData.channel === 'email' || formData.channel === 'all'}
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedToStep3}>
                Review Message
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Send</CardTitle>
            <CardDescription>
              Review your message before sending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <BroadcastPreview data={formData} />
            <RecipientPreview
              recipientType={formData.recipientType}
              channel={formData.channel}
              filter={formData.recipientFilter}
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  onClick={handleCreate}
                  disabled={isCreating || isSending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save as Draft
                </Button>
                <Button
                  onClick={handleSendNow}
                  disabled={isCreating || isSending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
