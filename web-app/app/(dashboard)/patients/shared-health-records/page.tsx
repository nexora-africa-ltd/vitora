// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Facility-scoped DHA Shared Health Record consent visit workspace. */

'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { useSHRConsents } from '@/lib/hooks/use-shr';

export default function SharedHealthRecordsPage() {
  const { data: visits = [], isLoading, isError } = useSHRConsents();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Shared Health Records"
        helpContent="DHA consent visits authorize access to a patient's shared clinical record. Access tokens remain on the server and are never shown here."
      />
      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading consent visits...</p>}
          {isError && <p className="p-6 text-sm text-destructive">Unable to load SHR consent visits.</p>}
          {!isLoading && !isError && visits.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No Shared Health Record visits</p>
              <p className="text-sm text-muted-foreground">Request consent from an individual patient record to begin.</p>
            </div>
          )}
          {visits.map((visit) => (
            <Link key={visit.id} href={`/patients/${visit.patient}`} className="flex flex-col gap-2 border-b p-4 last:border-b-0 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="font-medium">Patient #{visit.patient}</p><p className="truncate text-sm text-muted-foreground">{visit.visit_type} visit · Requested {new Date(visit.created_at).toLocaleDateString()}</p></div>
              <Badge variant={visit.status === 'APPROVED' ? 'default' : 'secondary'} className="w-fit shrink-0">{visit.status.replace('_', ' ')}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
