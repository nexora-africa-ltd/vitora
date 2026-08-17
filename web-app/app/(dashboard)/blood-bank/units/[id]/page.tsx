/**
 * Blood unit detail page.
 * Use by navigating to /blood-bank/units/[id] in the web app.
 * Inputs: route param `id`.
 */
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBloodUnit, useMarkUnitAvailable, useQuarantineUnit, useUpdateBloodUnit } from '@/lib/hooks/use-blood-bank';
import { UNIT_STATUS_COLORS, COMPONENT_LABELS } from '@/lib/types/blood-bank';
import type { UnitStatus } from '@/lib/types/blood-bank';
import { formatDate } from '@/lib/utils/format';

const UNIT_STATUSES: UnitStatus[] = ['COLLECTED', 'TESTING', 'AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED', 'QUARANTINED'];

export default function BloodUnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const unitId = Number(id);
  const { data: unit, isLoading } = useBloodUnit(Number.isNaN(unitId) ? undefined : unitId);
  const markAvailable = useMarkUnitAvailable();
  const quarantine = useQuarantineUnit();
  const updateUnit = useUpdateBloodUnit();
  const [quarantineReason, setQuarantineReason] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<UnitStatus>('COLLECTED');

  useEffect(() => {
    if (unit) {
      setSelectedStatus(unit.status);
    }
  }, [unit]);

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!unit) {
    return (
      <div className="space-y-4">
        <PageHeader title="Blood Unit" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Blood unit not found.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={unit.unit_number}
        helpContent="View blood unit details, screening status, storage, and lifecycle actions."
        actions={(
          <div className="flex gap-2">
            {unit.status === 'TESTING' && (
              <Button
                onClick={async () => {
                  try {
                    await markAvailable.mutateAsync(unit.id);
                    toast.success('Unit marked as available');
                  } catch {
                    toast.error('Failed to mark unit available');
                  }
                }}
                disabled={markAvailable.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Available
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/blood-bank/units')}>Back to Units</Button>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <Badge className={UNIT_STATUS_COLORS[unit.status]}>{unit.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Blood Group:</span>
              <Badge variant="outline" className="font-bold">{unit.blood_group}</Badge>
            </div>
            <p><span className="font-medium">Component:</span> {COMPONENT_LABELS[unit.component] || unit.component}</p>
            <p><span className="font-medium">Donor:</span> {unit.donor_name}</p>
            <p><span className="font-medium">Collection Date:</span> {formatDate(unit.collection_date)}</p>
            <p><span className="font-medium">Expiry Date:</span> {formatDate(unit.expiry_date)} {unit.is_expired && <span className="text-destructive">(Expired)</span>}</p>
            <p><span className="font-medium">Volume:</span> {unit.volume_ml} mL</p>
            <p><span className="font-medium">Storage Location:</span> {unit.storage_location || 'Not set'}</p>
            {unit.notes && <p><span className="font-medium">Notes:</span> {unit.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Screening</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">HIV:</span> {unit.hiv_screened ? 'Done' : 'Pending'}</p>
            <p><span className="font-medium">HBV:</span> {unit.hbv_screened ? 'Done' : 'Pending'}</p>
            <p><span className="font-medium">HCV:</span> {unit.hcv_screened ? 'Done' : 'Pending'}</p>
            <p><span className="font-medium">Syphilis:</span> {unit.syphilis_screened ? 'Done' : 'Pending'}</p>
            <p><span className="font-medium">Malaria:</span> {unit.malaria_screened ? 'Done' : 'Pending'}</p>
            <p><span className="font-medium">All Screens Negative:</span> {unit.all_screens_negative ? 'Yes' : 'No'}</p>

            <div className="pt-4 space-y-2 border-t mt-4">
              <Label>Change Status</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as UnitStatus)}>
                  <SelectTrigger className="w-full sm:w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{status.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await updateUnit.mutateAsync({ id: unit.id, data: { status: selectedStatus } });
                      toast.success(`Unit status updated to ${selectedStatus.replace('_', ' ')}`);
                    } catch {
                      toast.error('Failed to update unit status');
                    }
                  }}
                  disabled={updateUnit.isPending || selectedStatus === unit.status}
                  className="w-full sm:w-auto"
                >
                  Save Status
                </Button>
              </div>
            </div>

            <div className="pt-4 space-y-2 border-t mt-4">
              <Label htmlFor="quarantine-reason">Quarantine Reason</Label>
              <Input
                id="quarantine-reason"
                value={quarantineReason}
                onChange={(e) => setQuarantineReason(e.target.value)}
                placeholder="Reason for quarantine"
              />
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await quarantine.mutateAsync({ id: unit.id, reason: quarantineReason.trim() });
                    toast.success('Unit quarantined');
                  } catch {
                    toast.error('Failed to quarantine unit');
                  }
                }}
                disabled={quarantine.isPending}
                className="w-full sm:w-auto"
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Quarantine Unit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {unit.is_expired && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            This blood unit has expired and should not be used for transfusion.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
