'use client';

import { useState } from 'react';
import { Loader2, Table2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api/client';
import { theatreApi } from '@/lib/api/theatre';
import { useToast } from '@/lib/hooks/use-toast';
import { HelpPopover } from '@/components/shared/help-popover';
import type { IntraOpVital } from '@/lib/types/theatre';
import { vitalCellClass } from '@/lib/vitals-thresholds';

interface VitalsTableProps {
  vitals: IntraOpVital[];
  caseNumber: string;
  onVitalDeleted: () => void | Promise<void>;
}

export function VitalsTable({ vitals, caseNumber, onVitalDeleted }: VitalsTableProps) {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (vitalId: number) => {
    try {
      setDeletingId(vitalId);
      await theatreApi.deleteIntraOpVital(caseNumber, vitalId);
      toast({ title: 'Vital deleted', description: 'The reading has been removed.' });
      await onVitalDeleted();
    } catch (error) {
      toast({
        title: 'Unable to delete vital',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (vitals.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            Vitals Timeline
            <HelpPopover content="Tabular view of all recorded intra-operative vitals. Cells are highlighted amber (warning) or red (critical) when values exceed clinical thresholds. Delete individual readings with the trash icon." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No vital readings recorded yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Table2 className="h-4 w-4" />
          Vitals Timeline
          <HelpPopover content="Tabular view of all recorded intra-operative vitals. Cells are highlighted amber (warning) or red (critical) when values exceed clinical thresholds. Delete individual readings with the trash icon." />
          <Badge variant="outline" size="sm" className="ml-auto">
            {vitals.length} reading{vitals.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Time</TableHead>
                <TableHead>HR</TableHead>
                <TableHead>BP</TableHead>
                <TableHead>MAP</TableHead>
                <TableHead>SpO2</TableHead>
                <TableHead>RR</TableHead>
                <TableHead>EtCO2</TableHead>
                <TableHead>FiO2</TableHead>
                <TableHead>Temp</TableHead>
                <TableHead>CVP</TableHead>
                <TableHead>BIS</TableHead>
                <TableHead>TOF</TableHead>
                <TableHead>Glucose</TableHead>
                <TableHead>Pain</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vitals.map((v) => (
                <TableRow
                  key={v.id}
                  className={v.has_critical_vitals ? 'bg-red-50/50 dark:bg-red-950/20' : ''}
                >
                  <TableCell className="whitespace-nowrap text-xs font-medium">
                    {new Date(v.recorded_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {v.has_critical_vitals && (
                      <Badge variant="destructive" size="sm" className="ml-1">
                        !
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={vitalCellClass('heart_rate', v.heart_rate)}>
                    {v.heart_rate ?? '–'}
                  </TableCell>
                  <TableCell
                    className={
                      vitalCellClass('systolic_bp', v.systolic_bp) ||
                      vitalCellClass('diastolic_bp', v.diastolic_bp)
                    }
                  >
                    {v.systolic_bp != null && v.diastolic_bp != null
                      ? `${v.systolic_bp}/${v.diastolic_bp}`
                      : '–'}
                  </TableCell>
                  <TableCell>{v.mean_arterial_pressure ?? '–'}</TableCell>
                  <TableCell className={vitalCellClass('spo2', v.spo2)}>
                    {v.spo2 != null ? `${v.spo2}%` : '–'}
                  </TableCell>
                  <TableCell className={vitalCellClass('respiratory_rate', v.respiratory_rate)}>
                    {v.respiratory_rate ?? '–'}
                  </TableCell>
                  <TableCell className={vitalCellClass('etco2', v.etco2)}>
                    {v.etco2 ?? '–'}
                  </TableCell>
                  <TableCell>{v.fio2 != null ? `${v.fio2}%` : '–'}</TableCell>
                  <TableCell>{v.temperature ?? '–'}</TableCell>
                  <TableCell>{v.cvp ?? '–'}</TableCell>
                  <TableCell>{v.bis_index ?? '–'}</TableCell>
                  <TableCell>{v.tof_count ?? '–'}</TableCell>
                  <TableCell>{v.blood_glucose ?? '–'}</TableCell>
                  <TableCell>{v.pain_score ?? '–'}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => void handleDelete(v.id)}
                      disabled={deletingId === v.id}
                    >
                      {deletingId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
