'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { useAdmission } from '@/lib/hooks/use-inpatient';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';

/**
 * Shared layout for all /admissions/[id]/* sub-pages.
 *
 * Wraps children in PatientProvider so discharge, ward-round, kardex, transfer,
 * and detail pages all share a single cached Patient fetch via React Query.
 *
 * Also syncs the patient journey store from admission status so the sidebar
 * stage dot stays accurate during inpatient workflows.
 */
export default function AdmissionDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const admissionId = Number(params.id);
  const { data: admission } = useAdmission(admissionId);
  const syncFromAdmission = usePatientJourneyStore((s) => s.syncFromAdmission);

  // Sync journey stage from admission status whenever it changes
  useEffect(() => {
    if (admission) {
      syncFromAdmission(admission.patient, {
        admission_status: admission.admission_status,
        ward_name: admission.ward_name,
        bed_number: admission.bed_number,
        admission_id: admission.id,
      });
    }
  }, [admission?.admission_status, admission?.patient, admission?.id, syncFromAdmission]);

  return (
    <PatientProvider patientId={admission?.patient ?? null}>
      {children}
    </PatientProvider>
  );
}
