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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientContext } from '@/lib/context/patient-context';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useFacility } from '@/lib/context/facility-context';
import { useBloodDonors, useBloodUnits } from '@/lib/hooks/use-blood-bank';
import { PageHeader } from '@/components/shared/page-header';
import { buildEncounterHref } from '@/lib/utils/encounter-focus';
import type { Patient, PatientEncounter } from '@/lib/types/patient';

export default function NewLabOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const encounterRequired = false;
  const { hasModule, facility, facilityDetail } = useFacility();
  const bloodBankModuleEnabled = hasModule('blood_bank');
  const isStandaloneMode =
    (facilityDetail?.operating_mode || facility?.operating_mode || '').startsWith('STANDALONE_') ||
    facility?.deployment_profile === 'lis_standalone';

  const encounterId = searchParams.get('encounter');
  const patientId = searchParams.get('patient');
  const admissionId = searchParams.get('admission');

  // AI suggestion pre-fill params
  const prefillPriority = searchParams.get('priority') as 'ROUTINE' | 'URGENT' | 'STAT' | null;
  const prefillClinicalNotes = searchParams.get('clinical_notes');
  const prefillTestSearch = searchParams.get('test_search');

  // Try to get from context first (if within patient/encounter shell)
  let contextPatient: {
    id?: number;
    first_name?: string;
    last_name?: string;
    mrn?: string;
    gender?: string;
    date_of_birth?: string;
  } | null = null;
  let contextEncounter: {
    id?: number;
    encounter_type?: string;
    encounter_date?: string;
    chief_complaint?: string;
  } | null = null;
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
  const resolvedPatientId =
    effectivePatient?.id || encounter?.patient || (patientId ? parseInt(patientId) : null);
  const resolvedEncounterId = contextEncounter?.id || (encounterId ? parseInt(encounterId) : null);

  const [isPatientSheetOpen, setIsPatientSheetOpen] = useState(false);
  const [isBloodUnitTest, setIsBloodUnitTest] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);
  const [selectedDonorId, setSelectedDonorId] = useState<number | null>(null);
  const [selectedBloodUnitId, setSelectedBloodUnitId] = useState<number | null>(null);

  const { data: donorsPage } = useBloodDonors({ page_size: 100, is_active: true });
  const { data: unitsPage, isLoading: loadingUnits } = useBloodUnits({ page_size: 200 });

  const donors = donorsPage?.results || [];
  const selectedDonor = donors.find((donor) => donor.id === selectedDonorId) ?? null;
  const donorPatientId = selectedDonor?.patient ?? null;

  const eligibleUnits = (unitsPage?.results || []).filter(
    (unit) => unit.status !== 'EXPIRED' && unit.status !== 'ISSUED'
  );
  const donorUnits = selectedDonorId
    ? eligibleUnits.filter((unit) => unit.donor === selectedDonorId)
    : eligibleUnits;

  useEffect(() => {
    if (!bloodBankModuleEnabled && isBloodUnitTest) {
      setIsBloodUnitTest(false);
      setSelectedDonorId(null);
      setSelectedBloodUnitId(null);
    }
  }, [bloodBankModuleEnabled, isBloodUnitTest]);

  useEffect(() => {
    if (resolvedPatientId && selectedPatientId == null) {
      setSelectedPatientId(resolvedPatientId);
    }
  }, [resolvedPatientId, selectedPatientId]);

  useEffect(() => {
    if (isStandaloneMode) {
      return;
    }
    if (resolvedEncounterId && selectedEncounterId == null) {
      setSelectedEncounterId(resolvedEncounterId);
    }
  }, [isStandaloneMode, resolvedEncounterId, selectedEncounterId]);

  const activePatientId = selectedPatientId ?? resolvedPatientId;
  const activeEncounterId = isStandaloneMode ? null : selectedEncounterId ?? resolvedEncounterId;

  const effectiveSubjectPatientId = isBloodUnitTest ? donorPatientId : activePatientId;
  const effectiveBillingPatientId = isBloodUnitTest ? activePatientId : null;

  const { data: patientFromApi } = usePatient(activePatientId ?? 0);
  const { data: donorPatientFromApi } = usePatient(effectiveSubjectPatientId ?? 0);

  const { data: patientEncounters = [], isLoading: loadingPatientEncounters } = useQuery({
    queryKey: [
      'patients',
      effectiveBillingPatientId || activePatientId,
      'encounters',
      'new-lab-order',
    ],
    queryFn: () => patientsApi.getEncounters((effectiveBillingPatientId || activePatientId)!),
    enabled: !!(effectiveBillingPatientId || activePatientId) && !isStandaloneMode,
  });

  useEffect(() => {
    if (isStandaloneMode) return;
    if (!activeEncounterId || patientEncounters.length === 0) return;
    const exists = patientEncounters.some((item) => item.id === activeEncounterId);
    if (!exists && selectedEncounterId != null) {
      setSelectedEncounterId(null);
    }
  }, [isStandaloneMode, activeEncounterId, patientEncounters, selectedEncounterId]);

  const selectedPatientRecord = selectedPatient ?? patientFromApi ?? null;
  const selectedSubjectPatientRecord = isBloodUnitTest
    ? (donorPatientFromApi ?? null)
    : selectedPatientRecord;

  const selectedEncounterRecord = useMemo<PatientEncounter | null>(() => {
    if (isStandaloneMode) return null;
    if (!activeEncounterId) return null;
    return patientEncounters.find((item) => item.id === activeEncounterId) ?? null;
  }, [isStandaloneMode, activeEncounterId, patientEncounters]);

  const handleSuccess = (orderNumber: string) => {
    // Redirect back to the source context, not the order detail
    if (admissionId) {
      router.push(`/admissions/${admissionId}?tab=orders`);
    } else if (activeEncounterId) {
      router.push(buildEncounterHref(activeEncounterId, 'orders'));
    } else {
      router.push(orderNumber ? `/laboratory/orders/${orderNumber}` : '/laboratory/orders');
    }
  };

  const patientDisplayName = selectedSubjectPatientRecord
    ? `${selectedSubjectPatientRecord.first_name} ${selectedSubjectPatientRecord.last_name}`
    : effectivePatient
      ? `${effectivePatient.first_name} ${effectivePatient.last_name}`
      : encounter?.patient_name || 'patient';

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
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-500" />
              <h3 className="mb-2 text-lg font-semibold">Encounter Not Active</h3>
              <p className="mb-4 text-muted-foreground">
                Lab orders can only be created for active encounters. This encounter has been
                completed or cancelled.
              </p>
              <Button onClick={() => router.push('/encounters')}>Go to Encounters</Button>
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
        helpContent={
          isStandaloneMode
            ? `Create a standalone laboratory order for ${patientDisplayName}.`
            : `Create a laboratory order for ${patientDisplayName}.`
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>{isBloodUnitTest ? 'Recipient (Bill To)' : 'Patient'}</Label>
              {!isStandaloneMode && (
                <Sheet open={isPatientSheetOpen} onOpenChange={setIsPatientSheetOpen}>
                  <SheetTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      {selectedPatientRecord ? 'Change selection' : 'Select patient'}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-lg">
                    <SheetHeader>
                      <SheetTitle>
                        {isBloodUnitTest ? 'Configure blood unit test order' : 'Select patient'}
                      </SheetTitle>
                      <SheetDescription>
                        {isBloodUnitTest
                          ? 'Choose recipient (billing), donor, and blood unit.'
                          : 'Search by name, MRN, or phone number.'}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 space-y-4">
                      {bloodBankModuleEnabled && (
                        <div className="flex items-center justify-between rounded-md border p-3">
                          <div>
                            <Label htmlFor="blood-unit-test-toggle">Blood Unit Test</Label>
                            <p className="text-xs text-muted-foreground">
                              Enable donor/unit testing with separate recipient billing.
                            </p>
                          </div>
                          <Switch
                            id="blood-unit-test-toggle"
                            checked={isBloodUnitTest}
                            onCheckedChange={(checked) => {
                              setIsBloodUnitTest(checked);
                              setSelectedEncounterId(null);
                              if (!checked) {
                                setSelectedDonorId(null);
                                setSelectedBloodUnitId(null);
                              }
                            }}
                          />
                        </div>
                      )}

                      <PatientSelector
                        value={activePatientId}
                        selectedPatient={selectedPatientRecord}
                        onChange={(patientSelectionId, patientSelection) => {
                          setSelectedPatientId(patientSelectionId);
                          setSelectedPatient(patientSelection);
                          setSelectedEncounterId(null);
                        }}
                      />

                      {isBloodUnitTest && bloodBankModuleEnabled && (
                        <>
                          <div className="space-y-2">
                            <Label>Donor</Label>
                            <Select
                              value={selectedDonorId ? String(selectedDonorId) : 'none'}
                              onValueChange={(value) => {
                                setSelectedDonorId(value === 'none' ? null : Number(value));
                                setSelectedBloodUnitId(null);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select donor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No donor selected</SelectItem>
                                {donors.map((donor) => (
                                  <SelectItem key={donor.id} value={String(donor.id)}>
                                    {donor.donor_number} - {donor.first_name} {donor.last_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedDonor && !selectedDonor.patient && (
                              <p className="text-xs text-destructive">
                                Selected donor is not linked to a patient record.
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Blood Unit</Label>
                            <Select
                              value={selectedBloodUnitId ? String(selectedBloodUnitId) : 'none'}
                              onValueChange={(value) =>
                                setSelectedBloodUnitId(value === 'none' ? null : Number(value))
                              }
                              disabled={!selectedDonorId || donorUnits.length === 0 || loadingUnits}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !selectedDonorId ? 'Select donor first' : 'Select blood unit'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No blood unit selected</SelectItem>
                                {donorUnits.map((unit) => (
                                  <SelectItem key={unit.id} value={String(unit.id)}>
                                    {unit.unit_number} - {unit.blood_group} -{' '}
                                    {unit.component.replace('_', ' ')} ({unit.status})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!loadingUnits && selectedDonorId && donorUnits.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No eligible units for this donor (expired/transfused excluded).
                              </p>
                            )}
                            {selectedDonorId && !donorPatientId && (
                              <p className="text-xs text-amber-700">
                                Donor has no linked patient record. Order will be created as
                                donor-unit screening with billing to the selected recipient.
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <Label>
                          Encounter{' '}
                          {encounterRequired ? (
                            ''
                          ) : (
                            <span className="text-muted-foreground">(optional)</span>
                          )}
                        </Label>
                        <Select
                          value={activeEncounterId ? String(activeEncounterId) : 'none'}
                          onValueChange={(value) =>
                            setSelectedEncounterId(value === 'none' ? null : Number(value))
                          }
                          disabled={
                            !(effectiveBillingPatientId || activePatientId) ||
                            loadingPatientEncounters
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                effectiveBillingPatientId || activePatientId
                                  ? 'Select encounter'
                                  : 'Select a patient first'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {!encounterRequired && <SelectItem value="none">No encounter</SelectItem>}
                            {patientEncounters.map((encounterOption) => (
                              <SelectItem key={encounterOption.id} value={String(encounterOption.id)}>
                                {encounterOption.encounter_type} -{' '}
                                {new Date(encounterOption.encounter_date).toLocaleDateString()} -{' '}
                                {encounterOption.status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(effectiveBillingPatientId || activePatientId) &&
                          !loadingPatientEncounters &&
                          patientEncounters.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              No encounters found for this patient. You can still create a lab order
                              without linking an encounter.
                            </p>
                          )}
                      </div>

                      <div className="flex justify-end border-t pt-2">
                        <Button type="button" size="sm" onClick={() => setIsPatientSheetOpen(false)}>
                          Save Selection
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
            </div>

            {isStandaloneMode && (
              <div className="rounded-md border p-3">
                <PatientSelector
                  value={activePatientId}
                  selectedPatient={selectedPatientRecord}
                  onChange={(patientSelectionId, patientSelection) => {
                    setSelectedPatientId(patientSelectionId);
                    setSelectedPatient(patientSelection);
                    setSelectedEncounterId(null);
                  }}
                />
              </div>
            )}
            {selectedPatientRecord ? (
              <p className="text-sm text-muted-foreground">
                {isBloodUnitTest ? 'Recipient: ' : ''}
                {selectedPatientRecord.first_name} {selectedPatientRecord.last_name}
                {selectedPatientRecord.mrn ? ` - ${selectedPatientRecord.mrn}` : ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Select a patient to continue.</p>
            )}
            {isBloodUnitTest && selectedSubjectPatientRecord && (
              <p className="text-sm text-muted-foreground">
                Donor subject: {selectedSubjectPatientRecord.first_name}{' '}
                {selectedSubjectPatientRecord.last_name}
                {selectedSubjectPatientRecord.mrn ? ` - ${selectedSubjectPatientRecord.mrn}` : ''}
              </p>
            )}
            {!isStandaloneMode && selectedEncounterRecord && (
              <p className="text-sm text-muted-foreground">
                Encounter: {selectedEncounterRecord.encounter_type} -{' '}
                {new Date(selectedEncounterRecord.encounter_date).toLocaleDateString()} -{' '}
                {selectedEncounterRecord.status}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {((!activePatientId && !isBloodUnitTest) || (isBloodUnitTest && !selectedBloodUnitId)) && (
        <Card>
          <CardContent className="pt-6">
            <div className="py-4 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-500" />
              <p className="text-sm text-muted-foreground">
                {isBloodUnitTest
                  ? 'Select recipient, donor subject, and blood unit before placing a lab order.'
                  : 'A patient selection is required before placing a lab order.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      {activePatientId && (!isBloodUnitTest || !!selectedBloodUnitId) ? (
        <LabOrderForm
          patientId={effectiveSubjectPatientId ?? undefined}
          billingPatientId={effectiveBillingPatientId ?? undefined}
          billingPatientName={
            isBloodUnitTest && selectedPatientRecord
              ? `${selectedPatientRecord.first_name} ${selectedPatientRecord.last_name}`
              : undefined
          }
          bloodBankUnitId={isBloodUnitTest ? (selectedBloodUnitId ?? undefined) : undefined}
          encounterId={activeEncounterId ?? undefined}
          encounterRequired={encounterRequired}
          admissionId={admissionId ? parseInt(admissionId) : undefined}
          patientName={
            selectedSubjectPatientRecord
              ? `${selectedSubjectPatientRecord.first_name} ${selectedSubjectPatientRecord.last_name}`
              : effectivePatient
                ? `${effectivePatient.first_name} ${effectivePatient.last_name}`
                : (encounter?.patient_name ?? undefined)
          }
          patientMrn={
            (selectedSubjectPatientRecord?.mrn ||
              effectivePatient?.mrn ||
              encounter?.patient_mrn) ??
            undefined
          }
          patientGender={
            (selectedSubjectPatientRecord?.gender ||
              effectivePatient?.gender ||
              encounter?.patient_gender) ??
            undefined
          }
          patientDateOfBirth={
            (selectedSubjectPatientRecord?.date_of_birth ||
              effectivePatient?.date_of_birth ||
              encounter?.patient_date_of_birth) ??
            undefined
          }
          encounterType={
            (selectedEncounterRecord?.encounter_type ||
              contextEncounter?.encounter_type ||
              encounter?.encounter_type) ??
            undefined
          }
          encounterDate={
            (selectedEncounterRecord?.encounter_date ||
              contextEncounter?.encounter_date ||
              encounter?.encounter_date) ??
            undefined
          }
          chiefComplaint={
            (selectedEncounterRecord?.chief_complaint ||
              contextEncounter?.chief_complaint ||
              encounter?.chief_complaint) ??
            undefined
          }
          prefillPriority={prefillPriority || undefined}
          prefillClinicalNotes={prefillClinicalNotes || undefined}
          prefillTestSearch={prefillTestSearch || undefined}
          onSuccess={handleSuccess}
        />
      ) : null}
    </div>
  );
}
