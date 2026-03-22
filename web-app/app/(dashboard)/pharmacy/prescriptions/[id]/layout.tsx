'use client';

import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { usePrescription } from '@/lib/hooks/use-pharmacy';

/**
 * Wraps prescription detail sub-pages in PatientProvider.
 * Resolves patient ID from the prescription record so child components
 * have access to usePatientContext() for allergy warnings, SHA status, etc.
 */
export default function PrescriptionDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const prescriptionId = Number(params.id);
  const { data: prescription } = usePrescription(prescriptionId);

  return (
    <PatientProvider patientId={prescription?.patient ?? null}>
      {children}
    </PatientProvider>
  );
}
