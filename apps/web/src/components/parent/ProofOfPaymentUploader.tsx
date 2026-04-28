'use client';

import { useRef, useState } from 'react';
import { Upload, X, FileText, ImageIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  usePresignAttachmentUpload,
  useRegisterAttachment,
} from '@/hooks/parent-portal/use-parent-payment-attachments';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string) {
  return contentType.startsWith('image/')
    ? ImageIcon
    : FileText;
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ProofOfPaymentUploaderProps {
  /** Pre-link upload to a specific payment */
  paymentId?: string;
  /** Called after successful upload + registration */
  onSuccess?: () => void;
  /** Called when user cancels (optional) */
  onCancel?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProofOfPaymentUploader({
  paymentId,
  onSuccess,
  onCancel,
}: ProofOfPaymentUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phase, setPhase] = useState<
    'idle' | 'presigning' | 'uploading' | 'registering' | 'done'
  >('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { mutateAsync: presign } = usePresignAttachmentUpload();
  const { mutateAsync: register } = useRegisterAttachment();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setValidationError(null);
    setUploadError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!ACCEPTED_TYPES.includes(selected.type as (typeof ACCEPTED_TYPES)[number])) {
      setValidationError('Only PDF, JPG, JPEG and PNG files are accepted.');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (selected.size > MAX_BYTES) {
      setValidationError(`File must be smaller than 10 MB (selected: ${formatBytes(selected.size)}).`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    setValidationError(null);
    setUploadError(null);
    setUploadProgress(0);
    setPhase('idle');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit() {
    if (!file) return;
    setUploadError(null);
    setUploadProgress(0);

    try {
      // Step 1: presign
      setPhase('presigning');
      const { uploadUrl, key } = await presign({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      // Step 2: PUT directly to S3 via XHR for progress tracking
      setPhase('uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(
              new Error(
                `S3 upload failed (${xhr.status}). If this repeats, the platform team may need to configure CORS on the bucket.`,
              ),
            );
          }
        };
        xhr.onerror = () =>
          reject(
            new Error(
              'Upload failed — possible CORS error on S3 bucket. Contact support if this persists.',
            ),
          );
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: register with API
      setPhase('registering');
      await register({
        s3Key: key,
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        note: note.trim() || undefined,
        paymentId: paymentId || undefined,
      });

      setPhase('done');
      toast({
        title: 'Proof uploaded',
        description: 'The admin team will review your proof of payment.',
      });
      onSuccess?.();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Upload failed. Please try again.';
      setUploadError(msg);
      setPhase('idle');
      setUploadProgress(0);
    }
  }

  const isUploading = phase === 'presigning' || phase === 'uploading' || phase === 'registering';
  const FileIcon = file ? fileIcon(file.type) : FileText;

  return (
    <div className="space-y-4">
      {/* Drop zone / file picker */}
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading)
            inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Click to select proof of payment file"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-left">
              <FileIcon className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <p className="font-medium text-sm break-all">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
            </div>
            {!isUploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">Click to select a file</p>
            <p className="text-xs">PDF, JPG, JPEG or PNG — max 10 MB</p>
          </div>
        )}
      </div>

      {/* Validation error */}
      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {phase === 'presigning'
                ? 'Preparing upload...'
                : phase === 'registering'
                  ? 'Saving record...'
                  : 'Uploading...'}
            </span>
            {phase === 'uploading' && <span>{uploadProgress}%</span>}
          </div>
          <Progress value={phase === 'uploading' ? uploadProgress : undefined} />
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {/* Note field */}
      {!isUploading && phase !== 'done' && (
        <div className="space-y-1">
          <label
            htmlFor="pop-note"
            className="text-sm font-medium text-muted-foreground"
          >
            Note (optional)
          </label>
          <textarea
            id="pop-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="e.g. EFT reference CB-2026-001, paid 2026-04-28"
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">
            {note.length}/500
          </p>
        </div>
      )}

      {/* Actions */}
      {phase !== 'done' && (
        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isUploading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!file || isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload proof'}
          </Button>
        </div>
      )}
    </div>
  );
}
