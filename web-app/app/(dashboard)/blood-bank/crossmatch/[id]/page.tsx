/**
 * Crossmatch detail page.
 * Use by navigating to /blood-bank/crossmatch/[id] in the web app.
 * Inputs: route param `id`.
 */
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrossMatch, useRecordCrossMatchResult } from '@/lib/hooks/use-blood-bank';
import { CROSSMATCH_COLORS } from '@/lib/types/blood-bank';
import { formatDate } from '@/lib/utils/format';

export default function CrossMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const crossmatchId = Number(id);
  const { data: crossmatch, isLoading } = useCrossMatch(Number.isNaN(crossmatchId) ? undefined : crossmatchId);
  const recordResult = useRecordCrossMatchResult();

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!crossmatch) {
    return (
      <div className="space-y-4">
        <PageHeader title="Crossmatch" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Crossmatch not found.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Crossmatch #${crossmatch.id}`}
        helpContent="Review compatibility result for a selected blood unit and request."
        actions={(
          <Button variant="outline" onClick={() => router.push('/blood-bank/crossmatch')}>
            Back to Crossmatches
          </Button>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crossmatch Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Unit Number:</span> {crossmatch.unit_number}</p>
          <p><span className="font-medium">Blood Request ID:</span> {crossmatch.blood_request}</p>
          <p><span className="font-medium">Method:</span> {crossmatch.method}</p>
          <p><span className="font-medium">Performed By:</span> {crossmatch.performed_by_name}</p>
          <p><span className="font-medium">Performed At:</span> {formatDate(crossmatch.performed_at)}</p>
          <p>
            <span className="font-medium">Current Result:</span>{' '}
            <Badge className={CROSSMATCH_COLORS[crossmatch.result]}>{crossmatch.result}</Badge>
          </p>
          {crossmatch.notes && <p><span className="font-medium">Notes:</span> {crossmatch.notes}</p>}

          <div className="pt-4 mt-4 border-t flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={async () => {
                try {
                  await recordResult.mutateAsync({ id: crossmatch.id, result: 'COMPATIBLE' });
                  toast.success('Result recorded as compatible');
                } catch {
                  toast.error('Failed to record result');
                }
              }}
              disabled={recordResult.isPending || crossmatch.result === 'COMPATIBLE'}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Compatible
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await recordResult.mutateAsync({ id: crossmatch.id, result: 'INCOMPATIBLE' });
                  toast.success('Result recorded as incompatible');
                } catch {
                  toast.error('Failed to record result');
                }
              }}
              disabled={recordResult.isPending || crossmatch.result === 'INCOMPATIBLE'}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Mark Incompatible
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
