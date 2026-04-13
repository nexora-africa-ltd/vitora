'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { attendanceApi } from '@/lib/api/scheduling';
import { getApiErrorMessage } from '@/lib/api/client';
import { HelpPopover } from '@/components/shared/help-popover';

export function PayrollExportDialog() {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0]!;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]!);

  const exportMutation = useMutation({
    mutationFn: () => attendanceApi.payrollExport({ from_date: fromDate, to_date: toDate }),
    onSuccess: (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${fromDate}_${toDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Payroll export downloaded');
      setOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Payroll Export</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Payroll Export</DialogTitle>
            <HelpPopover content="Export attendance data as CSV for payroll processing. Includes all completed and absent shifts with hours worked, breaks, overtime, and late minutes." />
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-date">From Date</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-date">To Date</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !fromDate || !toDate}
          >
            <Download className="h-4 w-4 mr-1" />
            {exportMutation.isPending ? 'Generating...' : 'Download CSV'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
