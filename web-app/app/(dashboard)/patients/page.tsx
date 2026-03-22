'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Filter } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { PatientTable } from '@/components/patients/patient-table';
import { usePatients } from '@/lib/hooks/use-patients';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { GENDER_OPTIONS } from '@/lib/utils/constants';

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, isRefreshing } = usePageRefresh();

  // Check if we're in select mode (coming from another page that needs a patient)
  const selectMode = searchParams.get('select') === 'true';
  const returnTo = searchParams.get('returnTo');

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [gender, setGender] = useState<string>('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const pageSize = viewMode === 'grid' ? 12 : 10; // More items in grid view

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, error } = usePatients({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    gender: gender || undefined,
  });

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  // Handle patient selection in select mode
  const handlePatientSelect = (patientId: number) => {
    if (selectMode && returnTo) {
      // Append patient ID to the return URL
      const separator = returnTo.includes('?') ? '&' : '?';
      router.push(`${returnTo}${separator}patient=${patientId}`);
    } else {
      // Normal navigation to patient detail
      router.push(`/patients/${patientId}`);
    }
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        {/* Select mode banner */}
        {selectMode && (
          <Alert>
            <AlertDescription>
              Select a patient to continue. Click on a patient row to select them.
            </AlertDescription>
          </Alert>
        )}

        <PageHeader
          title={selectMode ? "Select Patient" : "Patients"}
          helpContent={selectMode
            ? "Choose a patient for the admission. Click on any patient row to select them."
            : `${data?.count ?? 0} patients registered. Search and manage patient records.`
          }
          actions={
            !selectMode && (
              <Button onClick={() => router.push('/patients/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Register Patient
              </Button>
            )
          }
        />

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, MRN, or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={gender}
          onValueChange={(value) => {
            setGender(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            {GENDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Patient table/grid */}
      <PatientTable
        patients={data?.results ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        selectMode={selectMode}
        onSelect={handlePatientSelect}
        viewMode={viewMode}
      />
      </div>
    </PullToRefresh>
  );
}
