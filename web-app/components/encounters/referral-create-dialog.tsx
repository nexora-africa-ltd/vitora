/**
 * Referral Create Dialog
 * Inline dialog for creating a clinical referral from an encounter.
 *
 * The form is intentionally lightweight — the clinician only fills:
 * - Target service (grouped dropdown)
 * - Reason (text)
 * - Priority (optional)
 * - Clinical notes (optional)
 * - Admission-specific fields (when applicable)
 *
 * Everything else (patient, encounter context, vitals snapshot)
 * is auto-populated by the backend.
 */

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { clinicsApi } from '@/lib/api/clinics';
import { encountersApi } from '@/lib/api/encounters';
import { useCreateReferral } from '@/lib/hooks/use-referrals';
import { getApiErrorMessage } from '@/lib/api/client';
import {
  TARGET_SERVICE_GROUPS,
  ADMISSION_SERVICES,
  SPECIALTY_CLINIC_SERVICES,
  REFERRAL_SPECIALTY_TO_CLINIC_TYPE,
  type ReferralTargetService,
  type ReferralPriority,
} from '@/lib/types/referral';

interface ReferralCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: number;
  patientId: number;
}

export function ReferralCreateDialog({
  open,
  onOpenChange,
  encounterId,
}: ReferralCreateDialogProps) {
  const createReferral = useCreateReferral();

  // Fetch encounter detail for clinical notes auto-population
  const { data: encounterDetail } = useQuery({
    queryKey: ['encounter-detail', encounterId],
    queryFn: () => encountersApi.get(encounterId),
    enabled: open && !!encounterId,
    staleTime: 60000,
  });

  // Form state
  const [targetService, setTargetService] = React.useState<ReferralTargetService | ''>('');
  const [reason, setReason] = React.useState('');
  const [priority, setPriority] = React.useState<ReferralPriority>('ROUTINE');
  const [clinicalNotes, setClinicalNotes] = React.useState('');
  const [isSensitive, setIsSensitive] = React.useState(false);

  // Admission-specific
  const [provisionalDiagnosisText, setProvisionalDiagnosisText] = React.useState('');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = React.useState('');
  const [preferredWardType, setPreferredWardType] = React.useState('');

  // External-specific
  const [externalFacilityName, setExternalFacilityName] = React.useState('');
  const [externalFacilityCode, setExternalFacilityCode] = React.useState('');
  const [destinationClinicId, setDestinationClinicId] = React.useState<string>('');

  // Auto-populate clinical notes from encounter when dialog opens
  React.useEffect(() => {
    if (!open || !encounterDetail) return;
    const parts: string[] = [];
    if (encounterDetail.chief_complaint) {
      parts.push(`Chief Complaint: ${encounterDetail.chief_complaint}`);
    }
    if (encounterDetail.history_of_present_illness) {
      parts.push(`HPI: ${encounterDetail.history_of_present_illness}`);
    }
    if (encounterDetail.physical_examination) {
      parts.push(`Examination: ${encounterDetail.physical_examination}`);
    }
    if (encounterDetail.assessment) {
      parts.push(`Assessment: ${encounterDetail.assessment}`);
    }
    if (encounterDetail.notes) {
      parts.push(`Notes: ${encounterDetail.notes}`);
    }
    if (encounterDetail.vitals_summary) {
      parts.push(`Vitals: ${encounterDetail.vitals_summary}`);
    }
    if (encounterDetail.allergies) {
      parts.push(`Allergies: ${encounterDetail.allergies}`);
    }
    if (encounterDetail.chronic_conditions) {
      parts.push(`Chronic Conditions: ${encounterDetail.chronic_conditions}`);
    }
    if (encounterDetail.current_medications) {
      parts.push(`Current Medications: ${encounterDetail.current_medications}`);
    }
    setClinicalNotes(parts.join('\n\n'));
  }, [open, encounterDetail]);

  const isAdmission = targetService
    ? ADMISSION_SERVICES.includes(targetService as ReferralTargetService)
    : false;
  const isExternal = targetService === 'OTHER';
  const specialtyClinicType = targetService
    ? REFERRAL_SPECIALTY_TO_CLINIC_TYPE[targetService as ReferralTargetService]
    : undefined;
  const requiresSpecialtyClinicRouting = Boolean(
    targetService && SPECIALTY_CLINIC_SERVICES.includes(targetService as ReferralTargetService) && specialtyClinicType
  );

  const { data: specialtyClinicsData, isLoading: isLoadingSpecialtyClinics } = useQuery({
    queryKey: ['referral-destination-clinics', specialtyClinicType],
    queryFn: () =>
      clinicsApi.list({
        clinic_type: specialtyClinicType,
        status: 'ACTIVE',
        page_size: 100,
      }),
    enabled: requiresSpecialtyClinicRouting && Boolean(specialtyClinicType),
  });

  const eligibleClinics = React.useMemo(
    () => (requiresSpecialtyClinicRouting ? specialtyClinicsData?.results ?? [] : []),
    [requiresSpecialtyClinicRouting, specialtyClinicsData?.results]
  );
  const hasMultipleEligibleClinics = eligibleClinics.length > 1;
  const autoSelectedClinicId = eligibleClinics.length === 1 ? eligibleClinics[0]?.id : undefined;
  const resolvedDestinationClinicId = destinationClinicId
    ? Number(destinationClinicId)
    : autoSelectedClinicId;

  const canSubmit =
    targetService &&
    reason.trim().length > 0 &&
    (!isAdmission || provisionalDiagnosisText.trim().length > 0) &&
    (!requiresSpecialtyClinicRouting || !!resolvedDestinationClinicId);

  function resetForm() {
    setTargetService('');
    setReason('');
    setPriority('ROUTINE');
    setClinicalNotes('');
    setIsSensitive(false);
    setProvisionalDiagnosisText('');
    setProvisionalDiagnosis('');
    setPreferredWardType('');
    setExternalFacilityName('');
    setExternalFacilityCode('');
    setDestinationClinicId('');
  }

  function handleTargetServiceChange(value: ReferralTargetService) {
    setTargetService(value);
    setDestinationClinicId('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!targetService || !reason.trim()) return;

    try {
      await createReferral.mutateAsync({
        encounter: encounterId,
        target_service: targetService as ReferralTargetService,
        destination_clinic: resolvedDestinationClinicId,
        reason: reason.trim(),
        priority,
        clinical_notes: clinicalNotes.trim() || undefined,
        is_sensitive: isSensitive,
        // Admission fields
        ...(isAdmission && {
          provisional_diagnosis_text: provisionalDiagnosisText.trim(),
          provisional_diagnosis: provisionalDiagnosis.trim() || undefined,
          preferred_ward_type: preferredWardType || undefined,
        }),
        // External fields
        ...(isExternal && {
          external_facility_name: externalFacilityName.trim() || undefined,
          external_facility_code: externalFacilityCode.trim() || undefined,
        }),
      });

      toast.success('Referral created successfully');
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Create Referral</DialogTitle>
            <HelpPopover content="Create a clinical referral to another service. The referral will be sent to the receiving department for review and acceptance. Clinical context (vitals, diagnoses) is auto-captured." />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Service */}
          <div className="space-y-2">
            <Label htmlFor="target-service">Refer To *</Label>
            <Select
              value={targetService}
              onValueChange={(v) => handleTargetServiceChange(v as ReferralTargetService)}
            >
              <SelectTrigger id="target-service">
                <SelectValue placeholder="Select service..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {TARGET_SERVICE_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {requiresSpecialtyClinicRouting && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="destination-clinic">Receiving Clinic</Label>
                <HelpPopover content="Specialty referrals are routed to an explicit clinic queue. If more than one clinic can receive this service, choose the destination clinic." />
              </div>

              {isLoadingSpecialtyClinics ? (
                <p className="text-sm text-muted-foreground">Loading eligible clinics...</p>
              ) : eligibleClinics.length === 0 ? (
                <p className="text-sm text-destructive">
                  No active clinic is configured for this specialty service in the current facility.
                </p>
              ) : hasMultipleEligibleClinics ? (
                <Select value={destinationClinicId} onValueChange={setDestinationClinicId}>
                  <SelectTrigger id="destination-clinic">
                    <SelectValue placeholder="Select receiving clinic..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleClinics.map((clinic) => (
                      <SelectItem key={clinic.id} value={String(clinic.id)}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border bg-background px-3 py-2 text-sm">
                  {eligibleClinics[0]?.name}
                </div>
              )}

              {hasMultipleEligibleClinics && !destinationClinicId && (
                <p className="text-xs text-muted-foreground">
                  Choose the clinic that should receive this referral.
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Referral *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the clinical reason for this referral..."
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as ReferralPriority)}
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ROUTINE">Routine</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="EMERGENCY">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clinical Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="clinical-notes">Additional Clinical Notes</Label>
            <Textarea
              id="clinical-notes"
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Any additional context for the receiving service..."
              rows={2}
            />
          </div>

          {/* Admission-specific fields */}
          {isAdmission && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Admission Details
              </p>

              <div className="space-y-2">
                <Label htmlFor="provisional-dx">Provisional Diagnosis *</Label>
                <Input
                  id="provisional-dx"
                  value={provisionalDiagnosisText}
                  onChange={(e) => setProvisionalDiagnosisText(e.target.value)}
                  placeholder="e.g., Severe pneumonia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="icd-code">ICD-10 Code</Label>
                <Input
                  id="icd-code"
                  value={provisionalDiagnosis}
                  onChange={(e) => setProvisionalDiagnosis(e.target.value)}
                  placeholder="e.g., J18.9"
                  maxLength={10}
                />
              </div>
            </div>
          )}

          {/* External facility fields */}
          {isExternal && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                External Facility
              </p>

              <div className="space-y-2">
                <Label htmlFor="ext-facility">Facility Name</Label>
                <Input
                  id="ext-facility"
                  value={externalFacilityName}
                  onChange={(e) => setExternalFacilityName(e.target.value)}
                  placeholder="e.g., Kenyatta National Hospital"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext-mfl">MFL Code</Label>
                <Input
                  id="ext-mfl"
                  value={externalFacilityCode}
                  onChange={(e) => setExternalFacilityCode(e.target.value)}
                  placeholder="Master Facility List code"
                />
              </div>
            </div>
          )}

          {/* Sensitive flag */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-sensitive"
              checked={isSensitive}
              onChange={(e) => setIsSensitive(e.target.checked)}
              className="h-4 w-4 rounded border-input"
              title="Mark as sensitive referral"
            />
            <Label htmlFor="is-sensitive" className="text-sm font-normal">
              Sensitive referral (HIV, GBV, Mental Health)
            </Label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit || createReferral.isPending}
            >
              {createReferral.isPending ? 'Creating...' : 'Create Referral'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
