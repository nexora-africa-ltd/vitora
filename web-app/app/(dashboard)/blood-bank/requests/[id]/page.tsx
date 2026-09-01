/**
 * Blood request detail page.
 * Use by navigating to /blood-bank/requests/[id] in the web app.
 * Inputs: route param `id`.
 */
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleX, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBloodRequest,
  useCancelBloodRequest,
  useCrossMatches,
} from '@/lib/hooks/use-blood-bank';
import { REQUEST_STATUS_COLORS, URGENCY_COLORS, COMPONENT_LABELS } from '@/lib/types/blood-bank';
import { formatDate } from '@/lib/utils/format';

export default function BloodRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const requestId = Number(id);
  const { data: request, isLoading } = useBloodRequest(
    Number.isNaN(requestId) ? undefined : requestId
  );
  const { data: crossmatchesData } = useCrossMatches(requestId);
  const cancelMutation = useCancelBloodRequest();
  const [cancelReason, setCancelReason] = useState('');

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <PageHeader title="Blood Request" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Blood request not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canCancel = !['ISSUED', 'TRANSFUSED', 'CANCELLED'].includes(request.status);
  const relatedCrossmatches = crossmatchesData?.results ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={request.request_number}
        helpContent="View blood request details, urgency, clinical indication, and cross-match progress."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/blood-bank/crossmatch')}>
              <TestTube className="mr-2 h-4 w-4" />
              Crossmatches
            </Button>
            <Button onClick={() => router.push(`/blood-bank/crossmatch/new?request=${request.id}`)}>
              <TestTube className="mr-2 h-4 w-4" />
              Create Crossmatch
            </Button>
            <Button variant="outline" onClick={() => router.push('/blood-bank/requests')}>
              Back to Requests
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Patient:</span> {request.patient_name} (
              {request.patient_mrn})
            </p>
            <p>
              <span className="font-medium">Requested By:</span> {request.requested_by_name}
            </p>
            <p>
              <span className="font-medium">Blood Group:</span>{' '}
              <Badge variant="outline" className="ml-1 font-bold">
                {request.blood_group}
              </Badge>
            </p>
            <p>
              <span className="font-medium">Component:</span>{' '}
              {COMPONENT_LABELS[request.component] || request.component}
            </p>
            <p>
              <span className="font-medium">Units Requested:</span> {request.units_requested}
            </p>
            <p>
              <span className="font-medium">Urgency:</span>{' '}
              <Badge className={`${URGENCY_COLORS[request.urgency]} ml-1`}>{request.urgency}</Badge>
            </p>
            <p>
              <span className="font-medium">Status:</span>{' '}
              <Badge className={`${REQUEST_STATUS_COLORS[request.status]} ml-1`}>
                {request.status.replace('_', ' ')}
              </Badge>
            </p>
            <p>
              <span className="font-medium">Created:</span> {formatDate(request.created_at)}
            </p>
            {request.patient_hemoglobin != null && (
              <p>
                <span className="font-medium">Patient Hb:</span> {request.patient_hemoglobin} g/dL
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Clinical Indication:</span>{' '}
              {request.clinical_indication}
            </p>
            {request.notes && (
              <p>
                <span className="font-medium">Notes:</span> {request.notes}
              </p>
            )}

            <div className="mt-4 space-y-2 border-t pt-4">
              <Label htmlFor="cancel-reason">Cancel Reason</Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation"
                disabled={!canCancel}
              />
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={!canCancel || cancelMutation.isPending}
                onClick={async () => {
                  try {
                    await cancelMutation.mutateAsync({
                      id: request.id,
                      reason: cancelReason.trim(),
                    });
                    toast.success('Blood request cancelled');
                  } catch {
                    toast.error('Failed to cancel request');
                  }
                }}
              >
                <CircleX className="mr-2 h-4 w-4" />
                Cancel Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Crossmatch Tests ({relatedCrossmatches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {relatedCrossmatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No crossmatch tests recorded for this request yet.
            </p>
          ) : (
            relatedCrossmatches.map((xm) => (
              <div
                key={xm.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{xm.unit_number}</p>
                  <p className="text-muted-foreground">
                    {xm.method} - {formatDate(xm.performed_at)} by {xm.performed_by_name}
                  </p>
                </div>
                <Badge>{xm.result}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
