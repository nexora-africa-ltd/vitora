'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatients } from '@/lib/hooks/use-patients';

const RECENT_PATIENTS_LIMIT = 8;

export function RecentPatients() {
  const { data: patients, isLoading } = usePatients({ page_size: RECENT_PATIENTS_LIMIT });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!patients?.results?.length) {
    return (
      <p className="text-sm text-primary text-center hover:text-accent-foreground py-4">
        No patients found
      </p>
    );
  }

  const hasMorePatients = patients.count > RECENT_PATIENTS_LIMIT;

  return (
    <div className="space-y-4">
      {patients.results.map((patient) => (
        <Link
          key={patient.id}
          href={`/patients/${patient.id}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent hover:text-bg-primary "
        >
          <Avatar>
            <AvatarFallback>
              {patient.first_name[0]}
              {patient.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 hover:text-primary">
            <p className="text-sm hover:text-primary font-medium ">
              {patient.first_name} {patient.last_name}
            </p>
            <p className="text-xs text-accent-foreground hover:text-primary">
              MRN: {patient.mrn}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs hover:text-inherit">
            {formatRelativeTime(patient.created_at)}
          </Badge>
        </Link>
      ))}

      {/* View All Patients Link */}
      {hasMorePatients && (
        <div className="pt-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-center" asChild>
            <Link href="/patients">
              View All Patients
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
