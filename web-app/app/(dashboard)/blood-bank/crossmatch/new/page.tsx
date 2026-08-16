/**
 * Create crossmatch page for blood bank.
 * Use by navigating to /blood-bank/crossmatch/new in the web app.
 * Inputs: optional query param `request` to preselect a blood request.
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBloodRequests, useBloodUnits, useCreateCrossMatch } from '@/lib/hooks/use-blood-bank';
import { getApiErrorMessage } from '@/lib/api/client';
import { COMPONENT_LABELS } from '@/lib/types/blood-bank';

const CROSSMATCH_METHODS = [
  'Gel card',
  'Tube method',
  'AHG (Coombs)',
  'Immediate spin',
  'Electronic crossmatch',
] as const;

export default function NewCrossMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateCrossMatch();

  const requestParam = searchParams.get('request');

  const [requestId, setRequestId] = useState(requestParam || '');
  const [unitId, setUnitId] = useState('');
  const [method, setMethod] = useState<(typeof CROSSMATCH_METHODS)[number]>('Gel card');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: requestsData } = useBloodRequests({
    page_size: 100,
    ordering: '-created_at',
  });

  const { data: unitsData } = useBloodUnits({
    page_size: 200,
    ordering: '-collection_date',
    status: 'AVAILABLE',
  });

  const selectedRequest = useMemo(
    () => requestsData?.results.find((r) => String(r.id) === requestId),
    [requestsData?.results, requestId]
  );

  const crossmatchableRequests = useMemo(
    () => (requestsData?.results || []).filter((request) => request.status === 'PENDING' || request.status === 'CROSSMATCH_PENDING'),
    [requestsData?.results]
  );

  const compatibleUnits = useMemo(
    () => (unitsData?.results || []).filter((u) => !selectedRequest || u.blood_group === selectedRequest.blood_group),
    [unitsData?.results, selectedRequest]
  );

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!requestId) {
      setError('Blood request is required');
      return;
    }
    if (!unitId) {
      setError('Blood unit is required');
      return;
    }

    try {
      await createMutation.mutateAsync({
        blood_request: Number(requestId),
        blood_unit: Number(unitId),
        method: method.trim() || 'Gel card',
        notes: notes.trim() || undefined,
      });
      toast.success('Crossmatch created');
      router.push('/blood-bank/crossmatch');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [requestId, unitId, method, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Create Crossmatch"
        helpContent="Link a blood request to an available blood unit and record the crossmatching method."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Request & Unit Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Find Blood Request *</Label>
              <Select value={requestId} onValueChange={(value) => {
                setRequestId(value);
                setUnitId('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select crossmatch-pending request" />
                </SelectTrigger>
                <SelectContent>
                  {crossmatchableRequests.map((request) => (
                    <SelectItem key={request.id} value={String(request.id)}>
                      {request.request_number} - {request.patient_name} ({request.patient_mrn}) [{request.blood_group}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Requests shown here come from blood requests in PENDING or CROSSMATCH PENDING state.
              </p>
            </div>

            {selectedRequest && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="font-medium">Request #:</span> {selectedRequest.request_number}</p>
                <p><span className="font-medium">Patient:</span> {selectedRequest.patient_name} ({selectedRequest.patient_mrn})</p>
                <p><span className="font-medium">Blood Group:</span> {selectedRequest.blood_group}</p>
                <p><span className="font-medium">Component:</span> {COMPONENT_LABELS[selectedRequest.component] || selectedRequest.component}</p>
                <p><span className="font-medium">Units Requested:</span> {selectedRequest.units_requested}</p>
                <p><span className="font-medium">Urgency:</span> {selectedRequest.urgency}</p>
                <p><span className="font-medium">Status:</span> {selectedRequest.status.replace('_', ' ')}</p>
              </div>
            )}

            <div>
              <Label>Blood Unit *</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select compatible available unit" />
                </SelectTrigger>
                <SelectContent>
                  {compatibleUnits.map((unit) => (
                    <SelectItem key={unit.id} value={String(unit.id)}>
                      {unit.unit_number} - {unit.blood_group} {unit.component} ({unit.donor_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRequest && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing units compatible with request blood group: {selectedRequest.blood_group}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Crossmatch Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="method">Method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as (typeof CROSSMATCH_METHODS)[number])}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CROSSMATCH_METHODS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra crossmatch notes"
                rows={5}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Creating...' : 'Create Crossmatch'}
        </Button>
      </div>
    </div>
  );
}
