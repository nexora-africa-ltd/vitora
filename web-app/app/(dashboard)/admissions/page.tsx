'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdmissionRecommendations, useAdmissions } from '@/lib/hooks/use-inpatient';

export default function AdmissionsPage() {
  const {
    data: recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useAdmissionRecommendations({ status: 'PENDING', ordering: '-created_at' });

  const {
    data: admissions,
    isLoading: admissionsLoading,
    error: admissionsError,
  } = useAdmissions({ admission_status: 'ACTIVE', ordering: '-admission_date' });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Admissions"
        description="Manage inpatient admissions and bed assignments"
        actions={
          <Button asChild>
            <Link href="/admissions/new">
              <Plus className="h-4 w-4 mr-2" />
              New Admission
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recommendationsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {recommendationsError && (
            <p className="text-sm text-destructive">Failed to load recommendations</p>
          )}
          {!recommendationsLoading && !recommendationsError && (
            <div className="space-y-2">
              {(recommendations?.results ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending recommendations.</p>
              ) : (
                recommendations?.results.map((rec) => (
                  <div key={rec.id} className="rounded-md border p-3">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{rec.reason}</p>
                      <p className="text-sm text-muted-foreground">
                        {rec.provisional_diagnosis} — {rec.provisional_diagnosis_text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Recommended by {rec.recommended_by_username}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Admissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {admissionsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {admissionsError && <p className="text-sm text-destructive">Failed to load admissions</p>}
          {!admissionsLoading && !admissionsError && (
            <div className="space-y-2">
              {(admissions?.results ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active admissions.</p>
              ) : (
                admissions?.results.map((adm) => (
                  <Link 
                    key={adm.id} 
                    href={`/admissions/${adm.id}`}
                    className="block rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{adm.admission_number}</p>
                      <p className="text-sm text-muted-foreground">{adm.patient_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {adm.ward_name} — {adm.bed_number}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
