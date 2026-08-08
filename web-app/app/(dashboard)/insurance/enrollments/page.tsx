'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  usePatientInsurances,
  useVerifyEnrollmentViaHealthcloud,
  useStartHealthcloudSession,
  useVisitAuthorizations,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { InsuranceVisitAuthorization, PatientInsurance } from '@/lib/types/insurance';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_verification: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-orange-100 text-orange-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function InsuranceEnrollmentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading, refetch } = usePatientInsurances({
    page: 1,
    page_size: 100,
    ordering: '-created_at',
  });
  const { data: authorizationsData } = useVisitAuthorizations({ page: 1, page_size: 500 });
  const verifyViaHealthcloud = useVerifyEnrollmentViaHealthcloud();
  const startSession = useStartHealthcloudSession();
  const enrollments = data?.results ?? [];
  const sessionsByEnrollment = useMemo(() => {
    const map = new Map<number, InsuranceVisitAuthorization>();
    (authorizationsData?.results ?? []).forEach((session) => {
      if (!map.has(session.enrollment)) {
        map.set(session.enrollment, session);
      }
    });
    return map;
  }, [authorizationsData?.results]);

  const handleVerifyViaHealthcloud = async (id: number) => {
    try {
      const result = await verifyViaHealthcloud.mutateAsync(id);
      toast({
        title: result.eligible ? 'Enrollment verified' : 'Eligibility check complete',
        description: result.message || 'HealthCloud eligibility check completed.',
      });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to verify via HealthCloud.', variant: 'destructive' });
    }
  };

  const handleStartSession = async (id: number) => {
    try {
      const result = await startSession.mutateAsync(id);
      toast({
        title: 'HealthCloud session started',
        description: `Session #${result.session.id} (${result.eligibility.eligible ? 'eligible' : 'not eligible'})`,
      });
      refetch();
      router.push(`/insurance/authorizations/${result.session.id}`);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to start HealthCloud session.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Insurance Enrollments"
        helpContent="Manage patient insurance enrollments and verify eligibility via HealthCloud."
        actions={
          <Button onClick={() => router.push('/insurance/enrollments/new')}>New Enrollment</Button>
        }
      />

      <ResponsiveTable<PatientInsurance>
        data={enrollments}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        onRowClick={(item) => router.push(`/patients/${item.patient}`)}
        emptyMessage="No enrollments found."
        columns={[
          {
            key: 'patient_name',
            header: 'Patient',
            cell: (item) => (
              <div>
                <p className="font-medium text-sm">{item.patient_name}</p>
                <p className="text-xs text-muted-foreground">{item.member_number}</p>
              </div>
            ),
          },
          {
            key: 'provider_name',
            header: 'Provider',
            cell: (item) => (
              <div>
                <p className="text-sm">{item.provider_name}</p>
                <p className="text-xs text-muted-foreground">{item.plan_name}</p>
              </div>
            ),
          },
          {
            key: 'valid_to',
            header: 'Validity',
            cell: (item) => (
              <p className="text-sm">
                {new Date(item.valid_from).toLocaleDateString()} - {new Date(item.valid_to).toLocaleDateString()}
              </p>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (item) => (
              <Badge className={STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-800'}>
                {item.status.replace('_', ' ')}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            cell: (item) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void handleVerifyViaHealthcloud(item.id); }}>
                  Verify
                </Button>
                {(() => {
                  const existingSession = sessionsByEnrollment.get(item.id);
                  if (existingSession) {
                    return (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/insurance/authorizations/${existingSession.id}`);
                        }}
                      >
                        View Session
                      </Button>
                    );
                  }
                  return (
                    <Button
                      size="sm"
                      disabled={startSession.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleStartSession(item.id);
                      }}
                    >
                      {startSession.isPending ? 'Starting...' : 'Start Session'}
                    </Button>
                  );
                })()}
              </div>
            ),
          },
        ]}
        mobileCard={(item) => (
          <Card key={item.id}>
            <CardContent className="p-3 space-y-2">
              <p className="font-medium text-sm">{item.patient_name}</p>
              <p className="text-xs text-muted-foreground">{item.provider_name} - {item.plan_name}</p>
              <Badge className={STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-800'}>
                {item.status.replace('_', ' ')}
              </Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleVerifyViaHealthcloud(item.id)}>
                  Verify
                </Button>
                {(() => {
                  const existingSession = sessionsByEnrollment.get(item.id);
                  if (existingSession) {
                    return (
                      <Button size="sm" onClick={() => router.push(`/insurance/authorizations/${existingSession.id}`)}>
                        View Session
                      </Button>
                    );
                  }
                  return (
                    <Button size="sm" disabled={startSession.isPending} onClick={() => void handleStartSession(item.id)}>
                      {startSession.isPending ? 'Starting...' : 'Start Session'}
                    </Button>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}
