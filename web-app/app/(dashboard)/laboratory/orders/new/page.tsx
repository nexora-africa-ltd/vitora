'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { LabOrderForm } from '@/components/laboratory/lab-order-form';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { usePatient } from '@/lib/hooks/use-patients';
import { patientsApi } from '@/lib/api/patients';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientContext } from '@/lib/context/patient-context';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { PageHeader } from '@/components/shared/page-header';
import type { Patient, PatientEncounter } from '@/lib/types/patient';

export default function NewLabOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const encounterRequired = false;

  const encounterId = searchParams.get('encounter');
  const patientId = searchParams.get('patient');
  const admissionId = searchParams.get('admission');

  // AI suggestion pre-fill params
  const prefillPriority = searchParams.get('priority') as 'ROUTINE' | 'URGENT' | 'STAT' | null;
  const prefillClinicalNotes = searchParams.get('clinical_notes');
  const prefillTestSearch = searchParams.get('test_search');

  // Try to get from context first (if within patient/encounter shell)
  let contextPatient: { id?: number; first_name?: string; last_name?: string; mrn?: string; gender?: string; date_of_birth?: string } | null = null;
  let contextEncounter: { id?: number; encounter_type?: string; encounter_date?: string; chief_complaint?: string } | null = null;
  let canPlaceOrders = true;

  try {
    const patientCtx = usePatientContext();
    contextPatient = patientCtx.patient;
  } catch {
    // Not in patient context
  }

  try {
    const encounterCtx = useEncounterContext();
    contextEncounter = encounterCtx.encounter;
    canPlaceOrders = encounterCtx.canPlaceOrders;
  } catch {
    // Not in encounter context
  }

  // If encounter is provided via URL, fetch encounter details (fallback)
  const { data: encounter, isLoading: loadingEncounter } = useEncounter(
    !contextEncounter && encounterId ? parseInt(encounterId) : 0
  );

  // Use context data if available, otherwise fall back to fetched/URL data
  const effectivePatient = contextPatient;

  // Determine patient info - encounter from API has patient, context encounter doesn't
  const resolvedPatientId = effectivePatient?.id || encounter?.patient || (patientId ? parseInt(patientId) : null);
  const resolvedEncounterId = contextEncounter?.id || (encounterId ? parseInt(encounterId) : null);

  const [isPatientSheetOpen, setIsPatientSheetOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);

  useEffect(() => {
    if (resolvedPatientId && selectedPatientId == null) {
      setSelectedPatientId(resolvedPatientId);
    }
  }, [resolvedPatientId, selectedPatientId]);

  useEffect(() => {
    if (resolvedEncounterId && selectedEncounterId == null) {
      setSelectedEncounterId(resolvedEncounterId);
    }
  }, [resolvedEncounterId, selectedEncounterId]);

  const activePatientId = selectedPatientId ?? resolvedPatientId;
  const activeEncounterId = selectedEncounterId ?? resolvedEncounterId;

  const { data: patientFromApi } = usePatient(activePatientId ?? 0);

  const { data: patientEncounters = [], isLoading: loadingPatientEncounters } = useQuery({
    queryKey: ['patients', activePatientId, 'encounters', 'new-lab-order'],
    queryFn: () => patientsApi.getEncounters(activePatientId!),
    enabled: !!activePatientId,
  });

  useEffect(() => {
    if (!activeEncounterId || patientEncounters.length === 0) return;
    const exists = patientEncounters.some((item) => item.id === activeEncounterId);
    if (!exists && selectedEncounterId != null) {
      setSelectedEncounterId(null);
    }
  }, [activeEncounterId, patientEncounters, selectedEncounterId]);

  const selectedPatientRecord = selectedPatient ?? patientFromApi ?? null;

  const selectedEncounterRecord = useMemo<PatientEncounter | null>(() => {
    if (!activeEncounterId) return null;
    return patientEncounters.find((item) => item.id === activeEncounterId) ?? null;
  }, [activeEncounterId, patientEncounters]);

  const handleSuccess = (orderNumber: string) => {
    // Redirect back to the source context, not the order detail
    if (admissionId) {
      router.push(`/admissions/${admissionId}?tab=orders`);
    } else if (activeEncounterId) {
      router.push(`/encounters/${activeEncounterId}`);
    } else {
      router.push(orderNumber ? `/laboratory/orders/${orderNumber}` : '/laboratory/orders');
    }
  };

  const patientDisplayName = selectedPatientRecord
    ? `${selectedPatientRecord.first_name} ${selectedPatientRecord.last_name}`
    : effectivePatient
      ? `${effectivePatient.first_name} ${effectivePatient.last_name}`
      : (encounter?.patient_name || 'patient');

  const header = (
    <PageHeader
      title="New Lab Order"
      helpContent="Create a laboratory order within a patient encounter."
    />
  );

  if (loadingEncounter) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Check if orders can be placed (encounter is active)
  if (!canPlaceOrders && resolvedEncounterId) {
    return (
      <div className="space-y-6">
        {header}

        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Encounter Not Active</h3>
              <p className="text-muted-foreground mb-4">
                Lab orders can only be created for active encounters. This encounter has been completed or cancelled.
              </p>
              <Button onClick={() => router.push('/encounters')}>
                Go to Encounters
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Lab Order"
        helpContent={`Create a laboratory order for ${patientDisplayName}.`}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Patient</Label>
              <Sheet open={isPatientSheetOpen} onOpenChange={setIsPatientSheetOpen}>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    {selectedPatientRecord ? 'Change patient' : 'Select patient'}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>Select patient</SheetTitle>
                    <SheetDescription>Search by name, MRN, or phone number.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4">
                    <PatientSelector
                      value={activePatientId}
                      selectedPatient={selectedPatientRecord}
                      onChange={(patientSelectionId, patientSelection) => {
                        setSelectedPatientId(patientSelectionId);
                        setSelectedPatient(patientSelection);
                        setSelectedEncounterId(null);
                      }}
                    />

                    <div className="space-y-2">
                      <Label>
                        Encounter {encounterRequired ? '' : <span className="text-muted-foreground">(optional)</span>}
                      </Label>
                      <Select
                        value={activeEncounterId ? String(activeEncounterId) : 'none'}
                        onValueChange={(value) => setSelectedEncounterId(value === 'none' ? null : Number(value))}
                        disabled={!activePatientId || loadingPatientEncounters}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={activePatientId ? 'Select encounter' : 'Select a patient first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {!encounterRequired && <SelectItem value="none">No encounter</SelectItem>}
                          {patientEncounters.map((encounterOption) => (
                            <SelectItem key={encounterOption.id} value={String(encounterOption.id)}>
                              {encounterOption.encounter_type} - {new Date(encounterOption.encounter_date).toLocaleDateString()} - {encounterOption.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {activePatientId && !loadingPatientEncounters && patientEncounters.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No encounters found for this patient. You can still create a lab order without linking an encounter.
                        </p>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {selectedPatientRecord ? (
              <p className="text-sm text-muted-foreground">
                {selectedPatientRecord.first_name} {selectedPatientRecord.last_name}
                {selectedPatientRecord.mrn ? ` - ${selectedPatientRecord.mrn}` : ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Select a patient to continue.</p>
            )}
            {selectedEncounterRecord && (
              <p className="text-sm text-muted-foreground">
                Encounter: {selectedEncounterRecord.encounter_type} - {new Date(selectedEncounterRecord.encounter_date).toLocaleDateString()} - {selectedEncounterRecord.status}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {!activePatientId && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500 mb-3" />
              <p className="text-sm text-muted-foreground">A patient selection is required before placing a lab order.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      {activePatientId ? (
        <LabOrderForm
          patientId={activePatientId}
          encounterId={activeEncounterId ?? undefined}
          encounterRequired={encounterRequired}
          admissionId={admissionId ? parseInt(admissionId) : undefined}
          patientName={selectedPatientRecord ? `${selectedPatientRecord.first_name} ${selectedPatientRecord.last_name}` : (effectivePatient ? `${effectivePatient.first_name} ${effectivePatient.last_name}` : (encounter?.patient_name ?? undefined))}
          patientMrn={(selectedPatientRecord?.mrn || effectivePatient?.mrn || encounter?.patient_mrn) ?? undefined}
          patientGender={(selectedPatientRecord?.gender || effectivePatient?.gender || encounter?.patient_gender) ?? undefined}
          patientDateOfBirth={(selectedPatientRecord?.date_of_birth || effectivePatient?.date_of_birth || encounter?.patient_date_of_birth) ?? undefined}
          encounterType={(selectedEncounterRecord?.encounter_type || contextEncounter?.encounter_type || encounter?.encounter_type) ?? undefined}
          encounterDate={(selectedEncounterRecord?.encounter_date || contextEncounter?.encounter_date || encounter?.encounter_date) ?? undefined}
          chiefComplaint={(selectedEncounterRecord?.chief_complaint || contextEncounter?.chief_complaint || encounter?.chief_complaint) ?? undefined}
          prefillPriority={prefillPriority || undefined}
          prefillClinicalNotes={prefillClinicalNotes || undefined}
          prefillTestSearch={prefillTestSearch || undefined}
          onSuccess={handleSuccess}
        />
      ) : null}
    </div>
  );
}
