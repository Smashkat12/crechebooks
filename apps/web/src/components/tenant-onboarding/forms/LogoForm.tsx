'use client';

/**
 * Logo Upload Inline Form
 * TASK-ACCT-UI-006: Inline form for onboarding wizard
 */

import { useState, useRef } from 'react';
import { Loader2, CheckCircle2, Upload, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';

interface LogoFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function LogoForm({ onComplete, onCancel }: LogoFormProps) {
  const { toast } = useToast();
  const { data: tenant, isLoading: tenantLoading, refetch } = useTenant();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (PNG, JPG, or SVG)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile || !tenant) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', selectedFile);

      await apiClient.post(`/tenants/${tenant.id}/logo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      await refetch();

      toast({
        title: 'Logo uploaded',
        description: 'Your creche logo has been uploaded successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to upload logo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Creche Logo</Label>
        <p className="text-sm text-muted-foreground">
          Upload your creche logo to display on invoices and statements.
        </p>
      </div>

      {/* Upload area */}
      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        {previewUrl ? (
          <div className="space-y-4">
            <div className="relative inline-block">
              <img
                src={previewUrl}
                alt="Logo preview"
                className="max-h-32 max-w-full object-contain mx-auto"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background shadow-sm"
                onClick={clearSelection}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose file
              </Button>
              <p className="text-sm text-muted-foreground mt-1">
                PNG, JPG, or SVG up to 5MB
              </p>
            </div>
          </div>
        )}
        <Input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        Your logo will appear on invoices, statements, and other documents sent to parents.
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Upload & Complete
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default LogoForm;
