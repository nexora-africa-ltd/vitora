'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { GrowthChart } from '@/components/mch/growth-chart';
import { GrowthMeasurementForm } from '@/components/mch/growth-measurement-form';
import { MalnutritionAlert } from '@/components/mch/malnutrition-alert';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { growthMeasurementsApi } from '@/lib/api/mch';
import { patientsApi } from '@/lib/api/patients';
import type { GrowthChartType } from '@/lib/types/mch';
import type { Sex, AgeRange } from '@/lib/data/who-growth';

export default function GrowthChartPage() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!, 10)
    : null;

  const { refresh, isRefreshing } = usePageRefresh();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(initialPatientId);
  const [measureDialogOpen, setMeasureDialogOpen] = useState(false);

  // Fetch patient info
  const { data: patient } = useQuery({
    queryKey: ['patient-detail', selectedPatientId],
    queryFn: () => (selectedPatientId ? patientsApi.getPatient(selectedPatientId) : null),
    enabled: !!selectedPatientId,
  });

  // Fetch growth measurements
  const {
    data: measurementsData,
    isLoading: measurementsLoading,
  } = useQuery({
    queryKey: ['growth-measurements', selectedPatientId],
    queryFn: () =>
      growthMeasurementsApi.list({
        patient: selectedPatientId!,
        ordering: 'measurement_date',
        page_size: 200,
      }),
    enabled: !!selectedPatientId,
  });

  const measurements = measurementsData?.results || [];
  const sex: Sex = (patient?.gender as Sex) || 'M';

  // Determine age range based on patient DOB
  const ageRange: AgeRange = useMemo(() => {
    if (!patient?.date_of_birth) return '0_5';
    const dob = new Date(patient.date_of_birth);
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears > 5) return 'all';
    return '0_5';
  }, [patient?.date_of_birth]);

  // Fetch chart data with precomputed percentile lines from API
  const {
    data: chartData,
    isLoading: chartLoading,
  } = useQuery({
    queryKey: ['growth-chart-data', selectedPatientId, 'weight_for_age', sex, ageRange],
    queryFn: () =>
      growthMeasurementsApi.getChartData(selectedPatientId!, 'weight_for_age', sex as 'M' | 'F', ageRange),
    enabled: !!selectedPatientId,
  });

  // Check for malnutrition alerts
  const latestMeasurement = measurements.length > 0
    ? measurements[measurements.length - 1]
    : null;
  const hasCriticalMeasurement = measurements.some((m) => m.has_critical_flag);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Growth Charts"
          helpContent="View and track child growth against WHO growth standards. Search for a child patient to view their growth chart with weight-for-age, height-for-age, and other indicators. Use 'Create Growth Chart' to record a new measurement for any child."
          actions={
            <Dialog open={measureDialogOpen} onOpenChange={setMeasureDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {selectedPatientId ? 'Record Measurement' : 'Create Growth Chart'}
                  </span>
                  <span className="sm:hidden">
                    {selectedPatientId ? 'Record' : 'Create'}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {selectedPatientId ? 'Record Growth Measurement' : 'Create Growth Chart'}
                  </DialogTitle>
                </DialogHeader>
                {!selectedPatientId ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Search for a child patient to start tracking their growth.
                      The chart will be created automatically once the first measurement is recorded.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Child Patient</label>
                      <PatientSearchInput
                        value={selectedPatientId}
                        onChange={(id) => setSelectedPatientId(id)}
                        placeholder="Search by name or MRN..."
                      />
                    </div>
                  </div>
                ) : (
                  <GrowthMeasurementForm
                    patientId={selectedPatientId}
                    patientDob={patient?.date_of_birth}
                    onSuccess={() => setMeasureDialogOpen(false)}
                    onCancel={() => setMeasureDialogOpen(false)}
                  />
                )}
              </DialogContent>
            </Dialog>
          }
        />

        {/* Patient Search */}
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Child Patient</label>
              <PatientSearchInput
                value={selectedPatientId}
                onChange={setSelectedPatientId}
                placeholder="Search for child by name or MRN..."
              />
            </div>
          </CardContent>
        </Card>

        {!selectedPatientId ? (
          <>
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">
                  Select a Child Patient
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Search for a child patient above to view their growth chart,
                  or browse the WHO reference charts below.
                </p>
              </CardContent>
            </Card>

            {/* Generic / reference WHO growth chart (no patient required).
                Users can switch indicator and Boys/Girls via the controls inside the chart. */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">WHO Reference Growth Chart</h2>
                <span className="text-xs text-muted-foreground">
                  (use the controls below to switch indicator or sex)
                </span>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <GrowthChart
                    measurements={[]}
                    sex="M"
                    defaultIndicator="weight_for_age"
                    ageRange="0_5"
                    hidePatientContext
                  />
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <>
            {/* Patient Summary */}
            {patient && (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {patient.first_name} {patient.last_name}
                    <span className="text-muted-foreground"> • {patient.mrn}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    DOB: {patient.date_of_birth} • Gender: {patient.gender === 'M' ? 'Male' : 'Female'}
                    {measurements.length > 0 && ` • ${measurements.length} measurement(s)`}
                  </p>
                </div>
              </div>
            )}

            {/* Malnutrition Alert */}
            {hasCriticalMeasurement && latestMeasurement && (
              <MalnutritionAlert
                muacClassification={latestMeasurement.muac_classification}
                nutritionalStatus={latestMeasurement.nutritional_status}
                hasCriticalFlag={latestMeasurement.has_critical_flag}
                patientName={patient ? `${patient.first_name} ${patient.last_name}` : undefined}
              />
            )}

            {/* Growth Chart */}
            {measurementsLoading || chartLoading ? (
              <Skeleton className="h-[450px] w-full" />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <GrowthChart
                    measurements={measurements}
                    sex={sex}
                    patientDob={patient?.date_of_birth}
                    apiPercentileLines={chartData?.percentile_lines as Record<string, { x: number; y: number }[]> | undefined}
                    ageRange={ageRange}
                  />
                </CardContent>
              </Card>
            )}

            {/* Measurement History */}
            {measurements.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-base font-medium mb-3">Measurement History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Age</th>
                          <th className="pb-2 font-medium">Weight</th>
                          <th className="pb-2 font-medium">Height</th>
                          <th className="pb-2 font-medium">MUAC</th>
                          <th className="pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...measurements].reverse().map((m) => (
                          <tr key={m.id} className={`border-b ${m.has_critical_flag ? 'bg-red-50' : ''}`}>
                            <td className="py-2">{m.measurement_date}</td>
                            <td className="py-2">
                              {m.age_in_days >= 1826
                                ? `${Math.floor(m.age_in_days / 365.25)}y ${Math.round((m.age_in_days % 365.25) / 30.4)}mo`
                                : `${Math.floor(m.age_in_days / 30)} mo`}
                            </td>
                            <td className="py-2">{m.weight ? `${m.weight} kg` : '—'}</td>
                            <td className="py-2">{m.height ? `${m.height} cm` : '—'}</td>
                            <td className="py-2">{m.muac ? `${m.muac} cm` : '—'}</td>
                            <td className="py-2">
                              {m.nutritional_status ? (
                                <span
                                  className={`text-xs font-medium ${
                                    m.has_critical_flag
                                      ? 'text-red-700'
                                      : m.nutritional_status === 'NORMAL'
                                        ? 'text-green-700'
                                        : 'text-orange-700'
                                  }`}
                                >
                                  {m.nutritional_status.replace(/_/g, ' ')}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
