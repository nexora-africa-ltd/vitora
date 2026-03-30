'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ProcedureForm } from '@/components/procedures/procedure-form';
import { proceduresApi } from '@/lib/api/procedures';
import type { ProcedureCatalogDetail } from '@/lib/types/procedure';

export default function EditProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const procedureId = parseInt(resolvedParams.id);

  const { data: procedure, isLoading, error } = useQuery<ProcedureCatalogDetail>({
    queryKey: ['procedure-catalog-entry', procedureId],
    queryFn: () => proceduresApi.getCatalogEntry(procedureId),
    enabled: Number.isFinite(procedureId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full max-w-4xl" />
      </div>
    );
  }

  if (error || !procedure) {
    return (
      <div className="space-y-4">
        <PageHeader title="Edit Procedure" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Procedure not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit: ${procedure.name}`}
        helpContent="Update procedure details, clinical requirements, coding, and billing information."
      />
      <div className="max-w-4xl mx-auto">
        <ProcedureForm procedure={procedure} />
      </div>
    </div>
  );
}
