'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { FileText, Loader2 } from 'lucide-react';
import { useCreateDiagnosticReport } from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';

interface DiagnosticReportFormProps {
  labOrderId: number;
  /** Custom trigger element. If not provided, a default button is rendered. */
  trigger?: React.ReactNode;
}

export function DiagnosticReportForm({
  labOrderId,
  trigger,
}: DiagnosticReportFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [clinicalInfo, setClinicalInfo] = useState('');

  const createReport = useCreateDiagnosticReport();

  const handleSubmit = async () => {
    try {
      const report = await createReport.mutateAsync({
        lab_order: labOrderId,
        conclusion: conclusion || undefined,
        clinical_info: clinicalInfo || undefined,
      });
      toast({
        title: 'Report created',
        description: `Diagnostic report ${report.report_number} has been created.`,
      });
      setOpen(false);
      setConclusion('');
      setClinicalInfo('');
      router.push(`/laboratory/reports/${report.report_number}`);
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create report',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Generate Diagnostic Report</DialogTitle>
            <HelpPopover content="Create a diagnostic report for this lab order. You can add a conclusion and clinical information now or edit them later." />
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="conclusion">Conclusion</Label>
            <Textarea
              id="conclusion"
              placeholder="Enter report conclusion..."
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinical-info">Clinical Information</Label>
            <Textarea
              id="clinical-info"
              placeholder="Enter relevant clinical information..."
              value={clinicalInfo}
              onChange={(e) => setClinicalInfo(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createReport.isPending}>
            {createReport.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Report'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
