'use client';

import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useParentAttachments } from '@/hooks/parent-portal/use-parent-payment-attachments';
import { formatDate } from '@/lib/utils/format';

/**
 * PendingPopBanner
 *
 * Shows a small informational line when the parent has one or more
 * proof-of-payment attachments in PENDING (under-review) status.
 * Renders nothing when there are no pending attachments.
 */
export function PendingPopBanner() {
  const { data: attachments } = useParentAttachments();

  if (!attachments) return null;

  const pending = attachments.filter((a) => a.reviewStatus === 'PENDING');
  if (pending.length === 0) return null;

  // Most recent submission by uploadedAt
  const mostRecent = pending.reduce((a, b) =>
    new Date(a.uploadedAt) >= new Date(b.uploadedAt) ? a : b,
  );

  const count = pending.length;
  const label =
    count === 1
      ? '1 proof of payment under review'
      : `${count} proofs of payment under review`;

  return (
    <p className="text-sm text-amber-700 flex items-center gap-1.5 mt-1">
      <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        {label} &mdash; submitted{' '}
        {formatDate(mostRecent.uploadedAt)}.{' '}
        <Link
          href="/parent/payment-attachments"
          className="underline underline-offset-2 hover:text-amber-900"
        >
          View
        </Link>
      </span>
    </p>
  );
}
