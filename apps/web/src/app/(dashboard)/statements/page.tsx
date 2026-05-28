'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable } from '@/components/statements';
import { StatementDetailDialog } from '@/components/statements/statement-detail-dialog';
import {
  useDownloadStatementPdf,
  useFinalizeStatement,
  useDeliverStatement,
  type StatementSummary,
} from '@/hooks/use-statements';
import { useToast } from '@/hooks/use-toast';

/**
 * Sent Statements archive.
 *
 * This page used to be the primary place to "Generate Statements" for a
 * period. With the live ledger on the parent detail page (Account tab) as
 * the primary view, generation now happens implicitly when an admin
 * presses "Send to Parent" there. This page records what has been sent.
 */
export default function StatementsPage() {
  const { downloadPdf } = useDownloadStatementPdf();
  const finalizeStatement = useFinalizeStatement();
  const deliverStatement = useDeliverStatement();
  const { toast } = useToast();

  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null,
  );
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleView = (statement: StatementSummary) => {
    setSelectedStatementId(statement.id);
    setDetailDialogOpen(true);
  };

  const handleDownload = async (statement: StatementSummary) => {
    try {
      await downloadPdf(statement.id, statement.statement_number);
      toast({
        title: 'Download started',
        description: `Downloading ${statement.statement_number}.pdf`,
      });
    } catch (error) {
      toast({
        title: 'Download failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to download statement',
        variant: 'destructive',
      });
    }
  };

  const handleFinalize = async (statement: StatementSummary) => {
    try {
      await finalizeStatement.mutateAsync(statement.id);
      toast({
        title: 'Statement Finalized',
        description: `${statement.statement_number} has been finalized`,
      });
    } catch (error) {
      toast({
        title: 'Finalize failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to finalize statement',
        variant: 'destructive',
      });
    }
  };

  const handleSend = async (statement: StatementSummary) => {
    try {
      await deliverStatement.mutateAsync({ statementId: statement.id });
      toast({
        title: 'Statement Sent',
        description: `${statement.statement_number} has been sent to ${statement.parent.name}`,
      });
    } catch (error) {
      toast({
        title: 'Send failed',
        description:
          error instanceof Error ? error.message : 'Failed to send statement',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sent Statements</h1>
        <p className="text-muted-foreground">
          Archive of statements sent to parents. Open a parent profile and use
          the Account tab to view the current live ledger or send a new
          statement.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StatementTable
            onView={handleView}
            onDownload={handleDownload}
            onFinalize={handleFinalize}
            onSend={handleSend}
            defaultStatus="DELIVERED"
          />
        </CardContent>
      </Card>

      <StatementDetailDialog
        statementId={selectedStatementId}
        isOpen={detailDialogOpen}
        onClose={() => {
          setDetailDialogOpen(false);
          setSelectedStatementId(null);
        }}
      />
    </div>
  );
}
