# Sprint 1.3-1.4 Track C: Encounter Module

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P1
**Estimated Tests**: 25 tests
**Parallel Track**: 🅳 Track D (Days 13-15)

---

## Overview

This document covers the Encounter module implementation including list view, detail view with vitals display, encounter timeline, and diagnosis/treatment plan views.

---

## 1. TypeScript Types

**lib/types/encounter.ts**:
```typescript
export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;

  // Encounter details
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  encounter_date: string;
  chief_complaint: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

  // Vitals
  temperature: number | null;
  pulse: number | null;
  blood_pressure: string | null;
  respiratory_rate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;

  // Medical history
  allergies: string;
  chronic_conditions: string;
  current_medications: string;
  past_surgeries: string;
  family_history: string;
  social_history: string;

  // Clinical notes
  history_of_present_illness: string;
  physical_examination: string;
  assessment: string;
  plan: string;

  // Metadata
  created_by: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Diagnosis {
  id: number;
  encounter: number;
  icd10_code: string;
  icd10_description?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL';
  notes: string;
  created_at: string;
}

export interface TreatmentPlan {
  id: number;
  encounter: number;
  plan_text: string;
  follow_up_date: string | null;
  follow_up_instructions: string;
  medications: Medication[];
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: number;
  treatment_plan: number;
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
}

export interface VitalSign {
  name: string;
  value: number | string | null;
  unit: string;
  normalRange: string;
  isAbnormal: boolean;
  isCritical: boolean;
}

export interface EncounterListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  status?: string;
  encounter_type?: string;
  ordering?: string;
}
```

---

## 2. Encounter API Client

**lib/api/encounters.ts**:
```typescript
import { apiClient } from './client';
import {
  Encounter,
  EncounterListParams,
  Diagnosis,
  TreatmentPlan,
} from '@/lib/types/encounter';
import { PaginatedResponse } from '@/lib/types/patient';

export const encountersApi = {
  /**
   * Get paginated list of encounters.
   */
  async list(params?: EncounterListParams): Promise<PaginatedResponse<Encounter>> {
    const response = await apiClient.get<PaginatedResponse<Encounter>>('/api/encounters/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single encounter by ID.
   */
  async get(id: number): Promise<Encounter> {
    const response = await apiClient.get<Encounter>(`/api/encounters/${id}/`);
    return response.data;
  },

  /**
   * Create a new encounter.
   */
  async create(data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.post<Encounter>('/api/encounters/', data);
    return response.data;
  },

  /**
   * Update an encounter.
   */
  async update(id: number, data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.patch<Encounter>(`/api/encounters/${id}/`, data);
    return response.data;
  },

  /**
   * Get diagnoses for an encounter.
   */
  async getDiagnoses(encounterId: number): Promise<Diagnosis[]> {
    const response = await apiClient.get<Diagnosis[]>(
      `/api/encounters/${encounterId}/diagnoses/`
    );
    return response.data;
  },

  /**
   * Get treatment plan for an encounter.
   */
  async getTreatmentPlan(encounterId: number): Promise<TreatmentPlan | null> {
    try {
      const response = await apiClient.get<TreatmentPlan>(
        `/api/encounters/${encounterId}/treatment-plan/`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },
};
```

---

## 3. Encounter Hooks

**lib/hooks/use-encounters.ts**:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { encountersApi } from '@/lib/api/encounters';
import { EncounterListParams, Encounter } from '@/lib/types/encounter';

/**
 * Hook for fetching paginated encounter list.
 */
export function useEncounters(params?: EncounterListParams) {
  return useQuery({
    queryKey: ['encounters', params],
    queryFn: () => encountersApi.list(params),
  });
}

/**
 * Hook for fetching a single encounter.
 */
export function useEncounter(id: number) {
  return useQuery({
    queryKey: ['encounters', id],
    queryFn: () => encountersApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching encounter diagnoses.
 */
export function useEncounterDiagnoses(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'diagnoses'],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching encounter treatment plan.
 */
export function useEncounterTreatmentPlan(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'treatment-plan'],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for creating an encounter.
 */
export function useCreateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Encounter>) => encountersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Hook for updating an encounter.
 */
export function useUpdateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Encounter> }) =>
      encountersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['encounters', variables.id] });
    },
  });
}
```

---

## 4. Encounter List Page

**app/(dashboard)/encounters/page.tsx**:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EncounterTable } from '@/components/encounters/encounter-table';
import { useEncounters } from '@/lib/hooks/use-encounters';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS } from '@/lib/utils/constants';

export default function EncountersPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [encounterType, setEncounterType] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error } = useEncounters({
    page,
    page_size: pageSize,
    status: status || undefined,
    encounter_type: encounterType || undefined,
    ordering: '-encounter_date',
  });

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Encounters"
        description={`${data?.count ?? 0} clinical encounters`}
        actions={
          <Button onClick={() => router.push('/encounters/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Encounter
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ENCOUNTER_STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={encounterType}
          onValueChange={(value) => {
            setEncounterType(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ENCOUNTER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Encounters table */}
      <EncounterTable
        encounters={data?.results ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

---

## 5. Encounter Table Component

**components/encounters/encounter-table.tsx**:
```typescript
'use client';

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Encounter } from '@/lib/types/encounter';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils/cn';

interface EncounterTableProps {
  encounters: Encounter[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function EncounterTable({
  encounters,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
}: EncounterTableProps) {
  const router = useRouter();

  const hasCriticalVitals = (encounter: Encounter) => {
    return encounter.spo2 !== null && encounter.spo2 < 95;
  };

  if (error) {
    return (
      <EmptyState
        title="Error loading encounters"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (!isLoading && encounters.length === 0) {
    return (
      <EmptyState
        title="No encounters found"
        description="Try adjusting your filters or create a new encounter."
        action={{
          label: 'New Encounter',
          onClick: () => router.push('/encounters/new'),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Chief Complaint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vitals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              encounters.map((encounter) => {
                const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
                const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);
                const isCritical = hasCriticalVitals(encounter);

                return (
                  <TableRow
                    key={encounter.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      isCritical && 'bg-red-50 dark:bg-red-950/20'
                    )}
                    onClick={() => router.push(`/encounters/${encounter.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{encounter.patient_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {encounter.patient_mrn}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{type?.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {encounter.chief_complaint}
                    </TableCell>
                    <TableCell>
                      <Badge className={status?.color}>{status?.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(encounter.encounter_date)}
                    </TableCell>
                    <TableCell>
                      {isCritical ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          SpO2: {encounter.spo2}%
                        </Badge>
                      ) : encounter.spo2 ? (
                        <span className="text-sm text-muted-foreground">
                          SpO2: {encounter.spo2}%
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 6. Encounter Detail Page

**app/(dashboard)/encounters/[id]/page.tsx**:
```typescript
'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit, User, Calendar, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounter, useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import { DiagnosesList } from '@/components/encounters/diagnoses-list';
import { TreatmentPlanView } from '@/components/encounters/treatment-plan-view';
import { MedicalHistoryView } from '@/components/encounters/medical-history-view';
import Link from 'next/link';

export default function EncounterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = Number(params.id);

  const { data: encounter, isLoading, error } = useEncounter(encounterId);
  const { data: diagnoses } = useEncounterDiagnoses(encounterId);
  const { data: treatmentPlan } = useEncounterTreatmentPlan(encounterId);

  if (isLoading) {
    return <EncounterDetailSkeleton />;
  }

  if (error || !encounter) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Encounter not found</h2>
        <p className="text-muted-foreground mt-2">
          The encounter you're looking for doesn't exist.
        </p>
        <Button onClick={() => router.push('/encounters')} className="mt-4">
          Back to Encounters
        </Button>
      </div>
    );
  }

  const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
  const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">
                {type?.label} Encounter
              </h1>
              <Badge className={status?.color}>{status?.label}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <Link
                href={`/patients/${encounter.patient}`}
                className="flex items-center gap-1 hover:text-primary"
              >
                <User className="h-4 w-4" />
                {encounter.patient_name} ({encounter.patient_mrn})
              </Link>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(encounter.encounter_date)}
              </span>
            </div>
          </div>
        </div>

        <Button variant="outline" asChild>
          <Link href={`/encounters/${encounter.id}/edit`}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Chief Complaint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Chief Complaint
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{encounter.chief_complaint}</p>
        </CardContent>
      </Card>

      {/* Vitals */}
      <VitalsDisplay encounter={encounter} />

      {/* Tabs */}
      <Tabs defaultValue="assessment" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="diagnoses">Diagnoses ({diagnoses?.length || 0})</TabsTrigger>
          <TabsTrigger value="treatment">Treatment Plan</TabsTrigger>
          <TabsTrigger value="history">Medical History</TabsTrigger>
        </TabsList>

        <TabsContent value="assessment">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {encounter.history_of_present_illness && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    History of Present Illness
                  </h4>
                  <p className="text-sm">{encounter.history_of_present_illness}</p>
                </div>
              )}
              {encounter.physical_examination && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Physical Examination
                  </h4>
                  <p className="text-sm">{encounter.physical_examination}</p>
                </div>
              )}
              {encounter.assessment && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Assessment
                  </h4>
                  <p className="text-sm">{encounter.assessment}</p>
                </div>
              )}
              {encounter.plan && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Plan
                  </h4>
                  <p className="text-sm">{encounter.plan}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnoses">
          <DiagnosesList diagnoses={diagnoses || []} />
        </TabsContent>

        <TabsContent value="treatment">
          <TreatmentPlanView treatmentPlan={treatmentPlan} />
        </TabsContent>

        <TabsContent value="history">
          <MedicalHistoryView encounter={encounter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EncounterDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
```

---

## 7. Vitals Display Component

**components/encounters/vitals-display.tsx**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Thermometer, Heart, Wind, Droplets, Scale, Ruler } from 'lucide-react';
import { Encounter, VitalSign } from '@/lib/types/encounter';
import { cn } from '@/lib/utils/cn';
import { VITAL_RANGES } from '@/lib/utils/constants';

interface VitalsDisplayProps {
  encounter: Encounter;
}

export function VitalsDisplay({ encounter }: VitalsDisplayProps) {
  const vitals: VitalSign[] = [
    {
      name: 'Temperature',
      value: encounter.temperature,
      unit: '°C',
      normalRange: '36.1-37.2',
      isAbnormal: encounter.temperature
        ? encounter.temperature < 36.1 || encounter.temperature > 37.2
        : false,
      isCritical: encounter.temperature
        ? encounter.temperature < 35 || encounter.temperature > 39
        : false,
    },
    {
      name: 'Pulse',
      value: encounter.pulse,
      unit: 'bpm',
      normalRange: '60-100',
      isAbnormal: encounter.pulse
        ? encounter.pulse < 60 || encounter.pulse > 100
        : false,
      isCritical: encounter.pulse
        ? encounter.pulse < 50 || encounter.pulse > 120
        : false,
    },
    {
      name: 'Blood Pressure',
      value: encounter.blood_pressure,
      unit: 'mmHg',
      normalRange: '90/60-120/80',
      isAbnormal: false, // Would need to parse BP string
      isCritical: false,
    },
    {
      name: 'Respiratory Rate',
      value: encounter.respiratory_rate,
      unit: '/min',
      normalRange: '12-20',
      isAbnormal: encounter.respiratory_rate
        ? encounter.respiratory_rate < 12 || encounter.respiratory_rate > 20
        : false,
      isCritical: encounter.respiratory_rate
        ? encounter.respiratory_rate < 8 || encounter.respiratory_rate > 30
        : false,
    },
    {
      name: 'SpO2',
      value: encounter.spo2,
      unit: '%',
      normalRange: '95-100',
      isAbnormal: encounter.spo2 ? encounter.spo2 < 95 : false,
      isCritical: encounter.spo2 ? encounter.spo2 < 90 : false,
    },
    {
      name: 'Weight',
      value: encounter.weight,
      unit: 'kg',
      normalRange: '',
      isAbnormal: false,
      isCritical: false,
    },
    {
      name: 'Height',
      value: encounter.height,
      unit: 'cm',
      normalRange: '',
      isAbnormal: false,
      isCritical: false,
    },
  ];

  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    Temperature: Thermometer,
    Pulse: Heart,
    'Blood Pressure': Activity,
    'Respiratory Rate': Wind,
    SpO2: Droplets,
    Weight: Scale,
    Height: Ruler,
  };

  const hasCriticalVitals = vitals.some((v) => v.isCritical && v.value !== null);

  return (
    <Card className={cn(hasCriticalVitals && 'border-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Vital Signs
          </CardTitle>
          {hasCriticalVitals && (
            <Badge variant="destructive">Critical Values</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {vitals.map((vital) => {
            const Icon = icons[vital.name] || Activity;

            return (
              <div
                key={vital.name}
                className={cn(
                  'p-3 rounded-lg border',
                  vital.isCritical && vital.value !== null && 'border-destructive bg-destructive/5',
                  vital.isAbnormal && !vital.isCritical && vital.value !== null && 'border-amber-500 bg-amber-500/5'
                )}
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{vital.name}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      'text-xl font-semibold',
                      vital.isCritical && vital.value !== null && 'text-destructive',
                      vital.isAbnormal && !vital.isCritical && vital.value !== null && 'text-amber-600'
                    )}
                  >
                    {vital.value ?? '—'}
                  </span>
                  {vital.value !== null && (
                    <span className="text-xs text-muted-foreground">{vital.unit}</span>
                  )}
                </div>
                {vital.normalRange && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Normal: {vital.normalRange}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 8. Diagnoses List Component

**components/encounters/diagnoses-list.tsx**:
```typescript
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Diagnosis } from '@/lib/types/encounter';
import { ClipboardList } from 'lucide-react';

interface DiagnosesListProps {
  diagnoses: Diagnosis[];
}

const diagnosisTypeColors: Record<string, string> = {
  PRIMARY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  SECONDARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DIFFERENTIAL: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function DiagnosesList({ diagnoses }: DiagnosesListProps) {
  if (!diagnoses.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No diagnoses"
        description="No diagnoses have been recorded for this encounter."
      />
    );
  }

  return (
    <div className="space-y-3">
      {diagnoses.map((diagnosis) => (
        <Card key={diagnosis.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                    {diagnosis.icd10_code}
                  </code>
                  <Badge className={diagnosisTypeColors[diagnosis.diagnosis_type]}>
                    {diagnosis.diagnosis_type}
                  </Badge>
                </div>
                <p className="font-medium">{diagnosis.icd10_description}</p>
                {diagnosis.notes && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {diagnosis.notes}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## 9. Treatment Plan View Component

**components/encounters/treatment-plan-view.tsx**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { TreatmentPlan } from '@/lib/types/encounter';
import { Pill, Calendar, ClipboardPlus } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';

interface TreatmentPlanViewProps {
  treatmentPlan: TreatmentPlan | null | undefined;
}

export function TreatmentPlanView({ treatmentPlan }: TreatmentPlanViewProps) {
  if (!treatmentPlan) {
    return (
      <EmptyState
        icon={ClipboardPlus}
        title="No treatment plan"
        description="No treatment plan has been created for this encounter."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan text */}
      {treatmentPlan.plan_text && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Treatment Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{treatmentPlan.plan_text}</p>
          </CardContent>
        </Card>
      )}

      {/* Medications */}
      {treatmentPlan.medications && treatmentPlan.medications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Medications ({treatmentPlan.medications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {treatmentPlan.medications.map((med) => (
                <div
                  key={med.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{med.drug_name}</h4>
                    <Badge variant="outline">{med.route}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Dosage: </span>
                      {med.dosage}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Frequency: </span>
                      {med.frequency}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration: </span>
                      {med.duration}
                    </div>
                  </div>
                  {med.instructions && (
                    <p className="text-sm text-muted-foreground">
                      Instructions: {med.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Follow-up */}
      {treatmentPlan.follow_up_date && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {formatDate(treatmentPlan.follow_up_date)}
            </p>
            {treatmentPlan.follow_up_instructions && (
              <p className="text-sm text-muted-foreground mt-2">
                {treatmentPlan.follow_up_instructions}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## 10. Medical History View Component

**components/encounters/medical-history-view.tsx**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Encounter } from '@/lib/types/encounter';
import { AlertTriangle, Pill, Scissors, Users, Heart } from 'lucide-react';

interface MedicalHistoryViewProps {
  encounter: Encounter;
}

export function MedicalHistoryView({ encounter }: MedicalHistoryViewProps) {
  const sections = [
    {
      title: 'Allergies',
      icon: AlertTriangle,
      content: encounter.allergies,
      className: encounter.allergies ? 'border-amber-500/50' : '',
    },
    {
      title: 'Chronic Conditions',
      icon: Heart,
      content: encounter.chronic_conditions,
    },
    {
      title: 'Current Medications',
      icon: Pill,
      content: encounter.current_medications,
    },
    {
      title: 'Past Surgeries',
      icon: Scissors,
      content: encounter.past_surgeries,
    },
    {
      title: 'Family History',
      icon: Users,
      content: encounter.family_history,
    },
    {
      title: 'Social History',
      icon: Users,
      content: encounter.social_history,
    },
  ];

  const filledSections = sections.filter((s) => s.content);

  if (filledSections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No medical history recorded for this encounter.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <Card key={section.title} className={section.className}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {section.content || (
                  <span className="text-muted-foreground italic">Not recorded</span>
                )}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

---

## 11. Test Coverage (25 tests)

### 11.1 Encounter API Tests (6 tests)
### 11.2 Encounter Hooks Tests (6 tests)
### 11.3 Encounter Table Tests (5 tests)
### 11.4 Vitals Display Tests (4 tests)
### 11.5 Encounter Detail Tests (4 tests)

```typescript
// __tests__/components/encounters/vitals-display.test.tsx
import { render, screen } from '@testing-library/react';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import { Encounter } from '@/lib/types/encounter';

describe('VitalsDisplay', () => {
  const mockEncounter: Partial<Encounter> = {
    temperature: 37.5,
    pulse: 80,
    blood_pressure: '120/80',
    respiratory_rate: 16,
    spo2: 98,
    weight: 70,
    height: 175,
  };

  it('should display all vital signs', () => {
    render(<VitalsDisplay encounter={mockEncounter as Encounter} />);

    expect(screen.getByText('37.5')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('120/80')).toBeInTheDocument();
    expect(screen.getByText('98')).toBeInTheDocument();
  });

  it('should show critical badge for SpO2 < 95', () => {
    render(<VitalsDisplay encounter={{ ...mockEncounter, spo2: 92 } as Encounter} />);

    expect(screen.getByText('Critical Values')).toBeInTheDocument();
  });

  it('should show — for missing vitals', () => {
    render(<VitalsDisplay encounter={{ ...mockEncounter, temperature: null } as Encounter} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should highlight abnormal values', () => {
    render(<VitalsDisplay encounter={{ ...mockEncounter, pulse: 110 } as Encounter} />);

    // Abnormal pulse should have warning styling
    const pulseValue = screen.getByText('110');
    expect(pulseValue).toHaveClass('text-amber-600');
  });
});
```

---

## 12. Checklist

### Days 13-14: Encounter List & Table
- [ ] Create Encounter types
- [ ] Implement Encounters API client
- [ ] Create useEncounters hooks
- [ ] Implement Encounter list page
- [ ] Implement EncounterTable component
- [ ] Add filters (status, type)
- [ ] Write 12 tests

### Day 15: Encounter Detail
- [ ] Implement Encounter detail page
- [ ] Create VitalsDisplay component
- [ ] Create DiagnosesList component
- [ ] Create TreatmentPlanView component
- [ ] Create MedicalHistoryView component
- [ ] Write 13 tests

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Encounter TypeScript types | 📋 |
| Encounters API client | 📋 |
| Encounter hooks (6 hooks) | 📋 |
| Encounter list page | 📋 |
| Encounter table with filters | 📋 |
| Encounter detail page | 📋 |
| Vitals display component | 📋 |
| Diagnoses list component | 📋 |
| Treatment plan view | 📋 |
| Medical history view | 📋 |
| Critical vital highlighting | 📋 |
| 25 encounter tests passing | 📋 |

---

**Previous**: [04-patient-module.md](./04-patient-module.md)
**Next**: [06-api-state-management.md](./06-api-state-management.md)
