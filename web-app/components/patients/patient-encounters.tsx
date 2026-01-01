'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { Stethoscope, Calendar } from 'lucide-react';

interface PatientEncountersProps {
  patientId: number;
}

export function PatientEncounters({ patientId }: PatientEncountersProps) {
  const { data: encounters, isLoading } = useQuery({
    queryKey: ['patients', patientId, 'encounters'],
    queryFn: () => patientsApi.getEncounters(patientId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!encounters?.length) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No encounters"
        description="This patient has no recorded encounters yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {encounters.map((encounter: { id: number; status: string; encounter_type: string; chief_complaint: string; encounter_date: string; created_at: string }) => {
        const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
        const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

        return (
          <Link key={encounter.id} href={`/encounters/${encounter.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Stethoscope className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{type?.label || encounter.encounter_type}</h4>
                        <Badge className={status?.color}>{status?.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {encounter.chief_complaint}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(encounter.encounter_date)}
                        </span>
                        <span>{formatRelativeTime(encounter.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
