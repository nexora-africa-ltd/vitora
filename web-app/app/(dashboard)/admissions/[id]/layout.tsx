'use client';

import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { useAdmission } from '@/lib/hooks/use-inpatient';

/**
 * Shared layout for all /admissions/[id]/* sub-pages.
 *
 * Wraps children in PatientProvider so discharge, ward-round, kardex, transfer,
 * and detail pages all share a single cached Patient fetch via React Query.
 *
 * The patient ID is resolved from the admission record itself (admission.patient).
 */
export default function AdmissionDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const admissionId = Number(params.id);
  const { data: admission } = useAdmission(admissionId);

  return (
    <PatientProvider patientId={admission?.patient ?? null}>
      {children}
    </PatientProvider>
  );
}
