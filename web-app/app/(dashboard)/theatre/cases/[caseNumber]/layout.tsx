/**
 * Theatre Case Layout
 *
 * Wraps all /theatre/cases/[caseNumber]/* routes with PatientProvider.
 * Fetches the surgery case to derive patientId, then activates the
 * patient context sidebar and PatientShellHeader for all child routes.
 */
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { theatreApi } from '@/lib/api/theatre';
import { PatientProvider } from '@/lib/context/patient-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

function CaseLayoutError({ message }: { message: string }) {
  return (
    <div className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/theatre/cases">Back to Cases</Link>
        </Button>
      </div>
    </div>
  );
}

export default function TheatreCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const caseNumber = typeof params.caseNumber === 'string' ? params.caseNumber : '';

  const {
    data: surgeryCase,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['theatre-case-layout', caseNumber],
    queryFn: () => theatreApi.getCase(caseNumber),
    enabled: caseNumber.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (!caseNumber) {
    return <CaseLayoutError message="Invalid case number." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !surgeryCase) {
    return <CaseLayoutError message={error?.message || 'Surgery case not found.'} />;
  }

  const patientId = surgeryCase.patient;

  if (!patientId) {
    return <CaseLayoutError message="Surgery case has no associated patient." />;
  }

  return (
    <PatientProvider patientId={patientId}>
      {children}
    </PatientProvider>
  );
}
