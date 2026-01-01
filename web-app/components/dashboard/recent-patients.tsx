'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatients } from '@/lib/hooks/use-patients';

export function RecentPatients() {
  const { data: patients, isLoading } = usePatients({ limit: 5 });

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
      <p className="text-sm text-muted-foreground text-center py-4">
        No patients found
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {patients.results.map((patient) => (
        <Link
          key={patient.id}
          href={`/patients/${patient.id}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <Avatar>
            <AvatarFallback>
              {patient.first_name[0]}
              {patient.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {patient.first_name} {patient.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              MRN: {patient.mrn}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {formatRelativeTime(patient.created_at)}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
