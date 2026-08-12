/**
 * New imaging order page.
 * Creates an order from URL context or a patient-and-encounter selection.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
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
import { ImagingOrderForm } from '@/components/imaging';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { usePatient } from '@/lib/hooks/use-patients';
import { patientsApi } from '@/lib/api/patients';
import type { Patient, PatientEncounter } from '@/lib/types/patient';

export default function NewImagingOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const patientIdParam = searchParams.get('patient');
  const patientNameParam = searchParams.get('patientName');
  const encounterIdParam = searchParams.get('encounter');
  const admissionId = searchParams.get('admission');

  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(() =>
    patientIdParam ? Number.parseInt(patientIdParam, 10) : null
  );
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(() =>
    encounterIdParam ? Number.parseInt(encounterIdParam, 10) : null
  );
  const [isContextSheetOpen, setIsContextSheetOpen] = useState(
    !patientIdParam || !encounterIdParam
  );

  const { data: patientFromApi } = usePatient(selectedPatientId ?? 0);
  const { data: patientEncounters = [], isLoading: loadingPatientEncounters } = useQuery({
    queryKey: ['patients', selectedPatientId, 'encounters', 'new-imaging-order'],
    queryFn: () => patientsApi.getEncounters(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  useEffect(() => {
    if (!selectedEncounterId || patientEncounters.length === 0) return;
    if (!patientEncounters.some((encounter) => encounter.id === selectedEncounterId)) {
      setSelectedEncounterId(null);
    }
  }, [patientEncounters, selectedEncounterId]);

  const selectedPatientRecord = selectedPatient ?? patientFromApi ?? null;
  const selectedEncounterRecord = useMemo<PatientEncounter | null>(() => {
    if (!selectedEncounterId) return null;
    return patientEncounters.find((encounter) => encounter.id === selectedEncounterId) ?? null;
  }, [patientEncounters, selectedEncounterId]);

  const canCreateOrder = !!selectedPatientId && !!selectedEncounterId;
  const patientName = selectedPatientRecord
    ? `${selectedPatientRecord.first_name} ${selectedPatientRecord.last_name}`
    : patientNameParam || undefined;

  const handleSuccess = (orderNumber: string) => {
    if (admissionId) {
      router.push(`/admissions/${admissionId}?tab=orders`);
    } else if (selectedEncounterId) {
      router.push(`/encounters/${selectedEncounterId}`);
    } else {
      router.push(`/imaging/orders/${orderNumber}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Go back</span>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Imaging Order</h1>
          <p className="text-muted-foreground">Select a patient and encounter to create an order.</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between gap-3">
            <Label>Patient and encounter</Label>
            <Sheet open={isContextSheetOpen} onOpenChange={setIsContextSheetOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  {canCreateOrder ? 'Change context' : 'Select context'}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Select patient and encounter</SheetTitle>
                  <SheetDescription>
                    Search for a patient, then select the encounter for this imaging order.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  <PatientSelector
                    value={selectedPatientId}
                    selectedPatient={selectedPatientRecord}
                    onChange={(patientSelectionId, patientSelection) => {
                      setSelectedPatientId(patientSelectionId);
                      setSelectedPatient(patientSelection);
                      setSelectedEncounterId(null);
                    }}
                  />

                  <div className="space-y-2">
                    <Label>Encounter</Label>
                    <Select
                      value={selectedEncounterId ? String(selectedEncounterId) : undefined}
                      onValueChange={(value) => {
                        setSelectedEncounterId(Number(value));
                        setIsContextSheetOpen(false);
                      }}
                      disabled={!selectedPatientId || loadingPatientEncounters}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            selectedPatientId ? 'Select encounter' : 'Select a patient first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {patientEncounters.map((encounter) => (
                          <SelectItem key={encounter.id} value={String(encounter.id)}>
                            {encounter.encounter_type} -{' '}
                            {new Date(encounter.encounter_date).toLocaleDateString()} -{' '}
                            {encounter.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPatientId &&
                      !loadingPatientEncounters &&
                      patientEncounters.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No encounters found for this patient. Create or select an encounter first.
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
              Encounter: {selectedEncounterRecord.encounter_type} -{' '}
              {new Date(selectedEncounterRecord.encounter_date).toLocaleDateString()} -{' '}
              {selectedEncounterRecord.status}
            </p>
          )}
        </CardContent>
      </Card>

      {!canCreateOrder ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              Select both a patient and encounter before placing an imaging order.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert>
            <AlertTitle>New: External request mode is available</AlertTitle>
            <AlertDescription>
              In the form below, set &quot;Request Destination&quot; to &quot;External Imaging
              Request&quot; when you need referral workflow instead of immediate in-house ordering.
            </AlertDescription>
          </Alert>

          <ImagingOrderForm
            patientId={selectedPatientId!}
            patientName={patientName}
            encounterId={selectedEncounterId!}
            onSuccess={handleSuccess}
            onCancel={() => router.back()}
          />
        </>
      )}
    </div>
  );
}
