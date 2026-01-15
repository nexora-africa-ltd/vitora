/**
 * Patient Shell Layout
 * 
 * Wraps all /patients/[id]/* routes with PatientProvider and PatientShellHeader.
 * This ensures patient context is available to all child routes and the
 * patient identity header persists across navigation.
 * 
 * Usage:
 * - Automatically applied to all routes under /patients/[id]/
 * - Children have access to usePatientContext()
 * - PatientShellHeader displays at the top of all patient routes
 */
'use client';

import { useParams } from 'next/navigation';
import { PatientProvider, usePatientContext } from '@/lib/context/patient-context';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// =============================================================================
// Error Boundary Component
// =============================================================================

function PatientLayoutError({ message }: { message: string }) {
  return (
    <div className="container mx-auto py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" asChild>
          <Link href="/patients">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Link>
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Layout Content (wrapped in provider)
// =============================================================================

function PatientLayoutContent({ children }: { children: React.ReactNode }) {
  const { error } = usePatientContext();

  if (error) {
    return <PatientLayoutError message={error.message} />;
  }

  return (
    <div className="flex flex-col min-h-full -m-4 md:-m-6 lg:-m-8">
      <PatientShellHeader />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const idParam = params.id;

  // Validate patientId from params
  const patientId = typeof idParam === 'string' ? parseInt(idParam, 10) : null;
  const isValidId = patientId !== null && !isNaN(patientId) && patientId > 0;

  if (!isValidId) {
    return <PatientLayoutError message="Invalid patient ID. Please select a valid patient." />;
  }

  return (
    <PatientProvider patientId={patientId}>
      <PatientLayoutContent>
        {children}
      </PatientLayoutContent>
    </PatientProvider>
  );
}
