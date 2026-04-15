'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import {
  AlertCircle,
  Calendar,
  Stethoscope,
  Thermometer,
  FileText,
  Pill,
  Beaker,
  Target,
} from 'lucide-react';
import { useEncounter, useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';

interface EncounterPeekContentProps {
  encounterId: number;
}

function VitalBadge({ label, value, unit }: { label: string; value?: number | string | null; unit?: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}{unit}</span>
    </div>
  );
}

export function EncounterPeekContent({ encounterId }: EncounterPeekContentProps) {
  const { data: encounter, isLoading, error } = useEncounter(encounterId);
  const { data: diagnoses } = useEncounterDiagnoses(encounterId);
  const { data: treatmentPlan } = useEncounterTreatmentPlan(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || !encounter) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load encounter"
        description="The encounter details could not be retrieved."
      />
    );
  }

  const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
  const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline">{type?.label || encounter.encounter_type}</Badge>
        <Badge className={status?.color || ''}>{status?.label || encounter.status}</Badge>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(encounter.encounter_date)}
        </span>
      </div>

      {/* Chief Complaint */}
      {encounter.chief_complaint && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Chief Complaint
          </h4>
          <p className="text-sm">{encounter.chief_complaint}</p>
        </section>
      )}

      <Separator />

      {/* Vitals */}
      {(encounter.temperature || encounter.pulse || encounter.blood_pressure || encounter.respiratory_rate || encounter.spo2 || encounter.weight) && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Thermometer className="h-3 w-3" /> Vitals
          </h4>
          <div className="flex flex-wrap gap-1.5">
            <VitalBadge label="Temp" value={encounter.temperature} unit="°C" />
            <VitalBadge label="Pulse" value={encounter.pulse} unit=" bpm" />
            <VitalBadge label="BP" value={encounter.blood_pressure} />
            <VitalBadge label="RR" value={encounter.respiratory_rate} unit="/min" />
            <VitalBadge label="SpO₂" value={encounter.spo2} unit="%" />
            <VitalBadge label="Wt" value={encounter.weight} unit=" kg" />
          </div>
          {encounter.has_critical_vitals && (
            <p className="text-xs text-destructive font-medium mt-1.5">
              ⚠ Critical vitals detected
            </p>
          )}
        </section>
      )}

      {/* SOAP Notes */}
      {(encounter.history_of_present_illness || encounter.physical_examination || encounter.assessment || encounter.notes) && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Clinical Notes
            </h4>
            <div className="space-y-2 text-sm">
              {encounter.history_of_present_illness && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">HPI: </span>
                  <span className="text-muted-foreground">{encounter.history_of_present_illness}</span>
                </div>
              )}
              {encounter.physical_examination && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Exam: </span>
                  <span className="text-muted-foreground">{encounter.physical_examination}</span>
                </div>
              )}
              {encounter.assessment && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Assessment: </span>
                  <span className="text-muted-foreground">{encounter.assessment}</span>
                </div>
              )}
              {encounter.notes && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Notes: </span>
                  <span className="text-muted-foreground">{encounter.notes}</span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Diagnoses */}
      {diagnoses && diagnoses.length > 0 && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target className="h-3 w-3" /> Diagnoses ({diagnoses.length})
            </h4>
            <div className="space-y-1">
              {diagnoses.map((dx) => (
                <div key={dx.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {dx.icd10_code_display || 'No code'}
                  </Badge>
                  <span className="truncate">{dx.free_text_diagnosis || dx.icd10_description || dx.icd10_display}</span>
                  {dx.diagnosis_type === 'PRIMARY' && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Primary</Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Treatment Plan */}
      {treatmentPlan && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Stethoscope className="h-3 w-3" /> Treatment Plan
            </h4>
            {treatmentPlan.clinical_notes && (
              <p className="text-sm text-muted-foreground">{treatmentPlan.clinical_notes}</p>
            )}
            {treatmentPlan.follow_up_instructions && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium">Follow-up:</span> {treatmentPlan.follow_up_instructions}
              </p>
            )}
          </section>
        </>
      )}

      {/* Prescriptions */}
      {prescriptions && prescriptions.length > 0 && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Pill className="h-3 w-3" /> Prescriptions ({prescriptions.length})
            </h4>
            <div className="space-y-1">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">{rx.status}</Badge>
                  <span className="truncate">
                    {rx.items?.map((i) => i.drug_name).filter(Boolean).join(', ') || `Rx #${rx.prescription_number}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Lab Orders */}
      {labOrders && labOrders.length > 0 && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Beaker className="h-3 w-3" /> Lab Orders ({labOrders.length})
            </h4>
            <div className="space-y-1">
              {labOrders.map((order) => (
                <div key={order.id} className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">{order.status}</Badge>
                  <span className="truncate">
                    {order.items?.map((i) => i.test_name).filter(Boolean).join(', ') || `Order #${order.order_number}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Clinician Info */}
      {(encounter.assigned_clinician_name || encounter.finalized_by_username) && (
        <>
          <Separator />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {encounter.assigned_clinician_name && (
              <span>Clinician: {encounter.assigned_clinician_name}</span>
            )}
            {encounter.finalized_by_username && encounter.finalized_at && (
              <span>Finalized by {encounter.finalized_by_username} on {formatDate(encounter.finalized_at)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
