'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable, GenerateStatementDialog } from '@/components/statements';
import { StatementDetailDialog } from '@/components/statements/statement-detail-dialog';
import { useDownloadStatementPdf, useFinalizeStatement, type StatementSummary } from '@/hooks/use-statements';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/api';

export default function StatementsPage() {
  const queryClient = useQueryClient();
  const { downloadPdf } = useDownloadStatementPdf();
  const finalizeStatement = useFinalizeStatement();
  const { toast } = useToast();

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
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
      console.error('Download failed:', error);
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Failed to download statement',
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
      console.error('Finalize failed:', error);
      toast({
        title: 'Finalize failed',
        description: error instanceof Error ? error.message : 'Failed to finalize statement',
        variant: 'destructive',
      });
    }
  };

  const handleSend = (statement: StatementSummary) => {
    // TODO: Implement send dialog - will be handled in TASK-STMT-007
    toast({
      title: 'Coming Soon',
      description: 'Statement delivery will be available in a future update',
    });
  };

  const handleGenerateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.statements.all });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statements</h1>
          <p className="text-muted-foreground">
            Generate and manage parent account statements
          </p>
        </div>
        <Button onClick={() => setGenerateDialogOpen(true)}>
          <ClipboardList className="h-4 w-4 mr-2" />
          Generate Statements
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StatementTable
            onView={handleView}
            onDownload={handleDownload}
            onFinalize={handleFinalize}
            onSend={handleSend}
          />
        </CardContent>
      </Card>

      <GenerateStatementDialog
        isOpen={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onSuccess={handleGenerateSuccess}
      />

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
