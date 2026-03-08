'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MoveRight, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdmission,
  useBeds,
  useBulkCompatibilityCheck,
  useCheckWardCompatibility,
  useCreateTransfer,
  useInpatientWards,
  useTransfers
} from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type { CompatibilityCheckResult, CompatibleWardInfo, IncompatibleWardInfo, TransferReason } from '@/lib/types/inpatient';

const TRANSFER_REASONS: { value: TransferReason; label: string }[] = [
  { value: 'STEP_UP', label: 'Step Up Care (e.g., to ICU)' },
  { value: 'STEP_DOWN', label: 'Step Down Care' },
  { value: 'SPECIALTY', label: 'Specialty Care Required' },
  { value: 'BED_MANAGEMENT', label: 'Bed Management/Capacity' },
  { value: 'PATIENT_REQUEST', label: 'Patient Request' },
  { value: 'OTHER', label: 'Other' },
];

export default function TransferPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const { data: wards } = useInpatientWards();
  const { data: transfersData } = useTransfers({ admission: admissionId });
  const createTransfer = useCreateTransfer();
  const checkCompatibility = useCheckWardCompatibility();
  const bulkCheckCompatibility = useBulkCompatibilityCheck();

  const [targetWardId, setTargetWardId] = useState<string>('');
  const [targetBedId, setTargetBedId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<TransferReason>('SPECIALTY');
  const [clinicalJustification, setClinicalJustification] = useState('');
  
  // Compatibility state - single ward check
  const [compatibilityResult, setCompatibilityResult] = useState<CompatibilityCheckResult | null>(null);
  const [compatibilityOverridden, setCompatibilityOverridden] = useState(false);
  const [showCompatibilityWarning, setShowCompatibilityWarning] = useState(false);
  
  // Bulk compatibility state - all wards check on load
  const [compatibleWards, setCompatibleWards] = useState<CompatibleWardInfo[]>([]);
  const [incompatibleWards, setIncompatibleWards] = useState<IncompatibleWardInfo[]>([]);
  const [bulkCheckComplete, setBulkCheckComplete] = useState(false);

  const selectedWardId = useMemo(() => (targetWardId ? Number(targetWardId) : undefined), [targetWardId]);
  const { data: beds } = useBeds({ ward: selectedWardId, status: 'AVAILABLE' });

  // Get transfers list from paginated response
  const transfers = Array.isArray(transfersData) ? transfersData : transfersData?.results ?? [];

  // Trigger bulk compatibility check immediately when admission loads
  useEffect(() => {
    if (admission?.patient && !bulkCheckComplete && !bulkCheckCompatibility.isPending) {
      bulkCheckCompatibility.mutateAsync({ patientIds: [admission.patient] })
        .then((result) => {
          const patientResult = result.results[0];
          if (patientResult) {
            // Filter out current ward from results
            setCompatibleWards(
              patientResult.compatible_wards.filter((w) => w.ward_id !== admission.ward)
            );
            setIncompatibleWards(
              patientResult.incompatible_wards.filter((w) => w.ward_id !== admission.ward)
            );
          }
          setBulkCheckComplete(true);
        })
        .catch((error) => {
          console.error('Failed to check ward compatibility:', error);
          setBulkCheckComplete(true);
        });
    }
  }, [admission?.patient, admission?.ward, bulkCheckComplete, bulkCheckCompatibility]);

  // Check compatibility when ward changes
  const handleWardChange = useCallback(async (wardId: string) => {
    setTargetWardId(wardId);
    setTargetBedId('');
    setCompatibilityResult(null);
    setCompatibilityOverridden(false);
    
    if (!wardId || !admission?.patient) return;
    
    try {
      const result = await checkCompatibility.mutateAsync({
        wardId: Number(wardId),
        patientId: admission.patient,
      });
      setCompatibilityResult(result);
      
      // Show warning dialog if incompatible
      if (!result.compatible) {
        setShowCompatibilityWarning(true);
      }
    } catch (error) {
      console.error('Failed to check compatibility:', error);
    }
  }, [admission?.patient, checkCompatibility]);

  const handleSubmit = async () => {
    if (!admission || !targetWardId || !targetBedId || !clinicalJustification) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if we need to warn about compatibility
    if (compatibilityResult && !compatibilityResult.compatible && !compatibilityOverridden) {
      setShowCompatibilityWarning(true);
      return;
    }

    try {
      await createTransfer.mutateAsync({
        admission: admissionId,
        source_ward: admission.ward,
        source_bed: admission.bed,
        destination_ward: Number(targetWardId),
        destination_bed: Number(targetBedId),
        reason: transferReason,
        clinical_handover_notes: clinicalJustification,
        transfer_date: new Date().toISOString(),
        transferred_by: user?.id,
      });
      toast({
        title: 'Success',
        description: 'Transfer completed successfully',
      });
      router.push('/admissions/');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to transfer patient',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <TransferSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot transfer a patient without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (admission.admission_status !== 'ACTIVE') {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Cannot Transfer</p>
        <p className="text-muted-foreground mt-2">
          Only active admissions can be transferred.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission Details
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Transfer Patient"
        helpContent={`Transfer ${admission.patient_name} to a different ward/bed.`}
      />

      {/* Current Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Location</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Ward</p>
              <p className="font-medium">{admission.ward_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Bed</p>
              <p className="font-medium">{admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admission Date</p>
              <p className="font-medium">{new Date(admission.admission_date).toLocaleDateString()}</p>
            </div>
          </div>
          {admission.mch_registration && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">Maternity Episode</p>
              <p className="mt-1 text-amber-900">
                This transfer stays within {admission.mch_registration_number || `MCH #${admission.mch_registration}`}. Use handover notes to document postpartum continuity.
              </p>
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-amber-900">
                <Link href={`/mch/${admission.mch_registration}`}>Open MCH registration</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Transfer To</CardTitle>
            <HelpPopover content="Select the destination ward and bed for the patient." />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bulk Compatibility Check Status */}
          {bulkCheckCompatibility.isPending && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Checking Ward Compatibility</AlertTitle>
              <AlertDescription>
                Analyzing patient compatibility with available wards...
              </AlertDescription>
            </Alert>
          )}

          {bulkCheckComplete && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Compatibility Check Complete</AlertTitle>
              <AlertDescription>
                {compatibleWards.length} recommended ward{compatibleWards.length !== 1 ? 's' : ''}
                {incompatibleWards.length > 0 && (
                  <>, {incompatibleWards.length} other ward{incompatibleWards.length !== 1 ? 's' : ''} with restrictions</>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Target Ward and Bed */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Target Ward *</Label>
              <Select
                value={targetWardId}
                onValueChange={handleWardChange}
                disabled={!bulkCheckComplete}
              >
                <SelectTrigger>
                  <SelectValue placeholder={bulkCheckComplete ? 'Select ward' : 'Checking compatibility...'} />
                </SelectTrigger>
                <SelectContent>
                  {/* Recommended wards first */}
                  {compatibleWards.length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                      Recommended
                    </div>
                  )}
                  {compatibleWards.map((w) => (
                    <SelectItem key={w.ward_id} value={String(w.ward_id)}>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <span>{w.ward_name}</span>
                        <Badge variant="outline" className="text-xs ml-auto bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                          {w.available_beds} beds
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                  {/* Other wards with restrictions */}
                  {incompatibleWards.length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2">
                      Other Wards (restrictions apply)
                    </div>
                  )}
                  {incompatibleWards.map((w) => (
                    <SelectItem key={w.ward_id} value={String(w.ward_id)}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span>{w.ward_name}</span>
                        <Badge variant="secondary" className="text-xs ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          {w.violations.length} restriction{w.violations.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {checkCompatibility.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying selection...
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Target Bed *</Label>
              <Select
                value={targetBedId}
                onValueChange={setTargetBedId}
                disabled={!targetWardId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={targetWardId ? 'Select bed' : 'Select a ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(beds) ? beds : beds?.results ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bed_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Compatibility Status */}
          {compatibilityResult && (
            <Alert variant="default">
              {compatibilityResult.compatible ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <AlertTitle>
                {compatibilityResult.compatible ? (
                  <span className="text-green-600">Ward Compatible</span>
                ) : (
                  <span className="text-amber-600">Ward Has Restrictions</span>
                )}
              </AlertTitle>
              <AlertDescription>
                {compatibilityResult.compatible ? (
                  <span className="text-green-600">Patient is compatible with the selected ward.</span>
                ) : (
                  <div className="space-y-2">
                    <p className="text-amber-600">
                      This ward has the following restrictions for this patient:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {compatibilityResult.violations.map((v, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Badge 
                            variant="secondary" 
                            className={`text-xs shrink-0 ${
                              v.severity === 'CRITICAL' 
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' 
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            }`}
                          >
                            {v.severity === 'CRITICAL' ? 'Important' : 'Note'}
                          </Badge>
                          <span className="text-muted-foreground">{v.message}</span>
                        </li>
                      ))}
                    </ul>
                    {compatibilityOverridden && (
                      <p className="text-sm font-medium mt-2 text-green-600">
                        ✓ Restrictions acknowledged
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Transfer Reason */}
          <div className="space-y-2">
            <Label>Transfer Reason *</Label>
            <Select value={transferReason} onValueChange={(v) => setTransferReason(v as TransferReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clinical Justification */}
          <div className="space-y-2">
            <Label htmlFor="clinical-justification">Clinical Justification *</Label>
            <Textarea
              id="clinical-justification"
              value={clinicalJustification}
              onChange={(e) => setClinicalJustification(e.target.value)}
              placeholder="Provide the clinical justification for this transfer..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Transfer History
            </CardTitle>
            <CardDescription>Previous transfers for this admission</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transfers.map((transfer: any) => (
                <div
                  key={transfer.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{transfer.source_ward_name || transfer.from_ward_name}</span>
                      <MoveRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{transfer.destination_ward_name || transfer.to_ward_name}</span>
                      <Badge variant="outline">
                        {transfer.reason_display || transfer.reason}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {transfer.clinical_handover_notes || transfer.clinical_notes || transfer.reason_details}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {transfer.transferred_by_username || transfer.transferred_by_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(transfer.transfer_date)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          onClick={handleSubmit}
          disabled={createTransfer.isPending || !targetWardId || !targetBedId || !clinicalJustification}
        >
          <MoveRight className="h-4 w-4 mr-2" />
          {createTransfer.isPending ? 'Transferring...' : 'Confirm Transfer'}
        </Button>
      </div>

      {/* Compatibility Review Dialog */}
      <Dialog open={showCompatibilityWarning} onOpenChange={setShowCompatibilityWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Review Ward Restrictions
            </DialogTitle>
            <DialogDescription>
              The selected ward has some restrictions that may not match this patient.
              Please review before proceeding.
            </DialogDescription>
          </DialogHeader>

          {compatibilityResult && !compatibilityResult.compatible && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                <p className="font-medium text-amber-700 dark:text-amber-300">Restrictions:</p>
                <ul className="space-y-2">
                  {compatibilityResult.violations.map((v, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge
                        variant="secondary"
                        className={`shrink-0 ${
                          v.severity === 'CRITICAL' 
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' 
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}
                      >
                        {v.severity === 'CRITICAL' ? 'Important' : 'Note'}
                      </Badge>
                      <div>
                        <p className="text-sm text-foreground">{v.message}</p>
                        {v.severity === 'CRITICAL' && !v.override_allowed && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            This restriction cannot be bypassed
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {compatibilityResult.has_critical_violations && (
                <Alert className="border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    This ward has important restrictions. Ensure this transfer is clinically appropriate.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowCompatibilityWarning(false)}
            >
              Go Back
            </Button>
            <Button
              onClick={() => {
                setCompatibilityOverridden(true);
                setShowCompatibilityWarning(false);
              }}
              disabled={
                compatibilityResult?.violations.some((v) => v.severity === 'CRITICAL' && !v.override_allowed)
              }
            >
              Acknowledge & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransferSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  );
}
