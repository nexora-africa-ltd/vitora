'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Syringe, AlertTriangle, Loader2, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { immunizationsApi } from '@/lib/api/mch';
import type { ImmunizationStatus } from '@/lib/types/mch';

interface ImmunizationsTabProps {
  patientId: number;
}

const statusIcons: Record<ImmunizationStatus, string> = {
  ADMINISTERED: '\u2705',
  SCHEDULED: '\uD83D\uDCC5',
  MISSED: '\u26A0\uFE0F',
  CONTRAINDICATED: '\uD83D\uDEAB',
  DEFERRED: '\u23F8\uFE0F',
};

const statusColors: Record<ImmunizationStatus, string> = {
  ADMINISTERED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  MISSED: 'bg-orange-100 text-orange-800',
  CONTRAINDICATED: 'bg-gray-100 text-gray-800',
  DEFERRED: 'bg-yellow-100 text-yellow-800',
};

export function ImmunizationsTab({ patientId }: ImmunizationsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['immunizations', patientId],
    queryFn: () => immunizationsApi.list({ patient: patientId, page_size: 100 }),
  });

  const generateMutation = useMutation({
    mutationFn: () => immunizationsApi.generateSchedule(patientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['immunizations', patientId] });
      toast({ title: 'Schedule Generated', description: 'Immunization schedule has been created.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate schedule.', variant: 'destructive' });
    },
  });

  const records = data?.results || [];

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load immunization records.</div>;
  }

  // Group by series_name/vaccine_name for organized display
  const grouped = records.reduce(
    (acc, record) => {
      const key = record.vaccine_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    },
    {} as Record<string, typeof records>,
  );

  const overdueCount = records.filter((r) => r.is_overdue).length;
  const administeredCount = records.filter((r) => r.status === 'ADMINISTERED').length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Immunizations</h3>
          <HelpPopover content="KEPI vaccination schedule tracking. Vaccines are auto-scheduled based on the child's date of birth per Kenya's Expanded Programme on Immunization." />
        </div>
        <div className="flex gap-2">
          {records.length === 0 && (
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarCheck className="h-4 w-4" />
              )}
              Generate Schedule
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/mch/immunizations?patient=${patientId}`, '_blank')}
          >
            <Syringe className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Full View</span>
          </Button>
        </div>
      </div>

      {/* Summary */}
      {records.length > 0 && (
        <div className="flex gap-3 text-sm">
          <span className="text-muted-foreground">
            {administeredCount}/{records.length} administered
          </span>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} overdue
            </Badge>
          )}
        </div>
      )}

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No immunization records yet. Generate the KEPI schedule to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([vaccineName, recs]) => (
            <Card key={vaccineName}>
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-sm font-medium">{vaccineName}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                  {recs.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{statusIcons[record.status]}</span>
                        <span className="text-muted-foreground">
                          Dose {record.dose_number}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span>
                          {record.administered_date
                            ? formatDate(record.administered_date)
                            : `Due ${formatDate(record.scheduled_date)}`}
                        </span>
                      </div>
                      <Badge
                        className={`${statusColors[record.status]} shrink-0 text-xs`}
                      >
                        {record.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
