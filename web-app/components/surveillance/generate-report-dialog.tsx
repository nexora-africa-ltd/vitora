'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDate } from '@/lib/utils/format';
import { toast } from '@/lib/hooks/use-toast';

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Mode = 'previous' | 'specific';

function getWeekRange(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return { weekStart, weekEnd };
}

export function GenerateReportDialog({ open, onOpenChange, onSuccess }: GenerateReportDialogProps) {
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<Mode>('previous');
  const [year, setYear] = useState(String(currentYear));
  const [week, setWeek] = useState('1');

  const yearOptions = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => String(currentYear - index));
  }, [currentYear]);

  const weekOptions = useMemo(() => {
    return Array.from({ length: 53 }, (_, index) => String(index + 1));
  }, []);

  const weekRange = useMemo(() => {
    if (mode !== 'specific') return null;
    const weekNumber = Number(week);
    const yearNumber = Number(year);
    if (!weekNumber || !yearNumber) return null;
    return getWeekRange(yearNumber, weekNumber);
  }, [mode, week, year]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (payload?: { epi_year?: number; epi_week?: number }) =>
      surveillanceApi.generateIDSRReport(payload),
    onSuccess: () => {
      toast({
        title: 'Report generated',
        description: 'The IDSR weekly report has been created.',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: 'Generation failed',
        description: 'Unable to generate the report. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = async () => {
    if (mode === 'specific') {
      await mutateAsync({
        epi_year: Number(year),
        epi_week: Number(week),
      });
      return;
    }
    await mutateAsync({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Generate IDSR Report</DialogTitle>
            <HelpPopover content="Generate a weekly IDSR report for the previous week or for a specific epidemiological week." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Report period</Label>
            <RadioGroup value={mode} onValueChange={(value) => setMode(value as Mode)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="previous" id="idsr-previous" />
                <Label htmlFor="idsr-previous">Previous week (recommended)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="idsr-specific" />
                <Label htmlFor="idsr-specific">Specific week</Label>
              </div>
            </RadioGroup>
          </div>

          {mode === 'specific' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Week</Label>
                <Select value={week} onValueChange={setWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        Week {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {weekRange && (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {formatDate(weekRange.weekStart)} - {formatDate(weekRange.weekEnd)}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleGenerate} disabled={isPending}>
            {isPending ? 'Generating...' : 'Generate Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
