'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { usePatients } from '@/lib/hooks/use-patients';
import { DashboardEmptyState, DashboardFooterLink, DashboardListSkeleton } from './widget-primitives';

const RECENT_PATIENTS_LIMIT = 8;

export function RecentPatients() {
  const { data: patients, isLoading } = usePatients({ page_size: RECENT_PATIENTS_LIMIT });

  if (isLoading) {
    return <DashboardListSkeleton rows={5} />;
  }

  if (!patients?.results?.length) {
    return (
      <DashboardEmptyState
        icon={Users}
        title="No recent patients"
        description="New registrations and recent check-ins will appear here once patient activity starts."
      />
    );
  }

  const hasMorePatients = patients.count > RECENT_PATIENTS_LIMIT;

  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label="Recent patients">
        {patients.results.map((patient) => (
          <li key={patient.id}>
            <Link
              href={`/patients/${patient.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-muted/10 p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {patient.first_name[0]}
                  {patient.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">MRN {patient.mrn}</p>
                  </div>
                  <Badge variant="secondary" className="w-fit shrink-0 self-start">
                    {formatRelativeTime(patient.created_at)}
                  </Badge>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {hasMorePatients && (
        <DashboardFooterLink href="/patients" label="View All Patients" />
      )}
    </div>
  );
}
