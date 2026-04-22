'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PatientTable } from '@/components/patients/patient-table';
import { usePatients } from '@/lib/hooks/use-patients';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context';
import { GENDER_OPTIONS } from '@/lib/utils/constants';
import { organizationsApi } from '@/lib/api/organizations';

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility, organization } = useFacility();

  // Check if we're in select mode (coming from another page that needs a patient)
  const selectMode = searchParams.get('select') === 'true';
  const returnTo = searchParams.get('returnTo');

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [gender, setGender] = useState<string>('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentFacilityOnly, setCurrentFacilityOnly] = useState(true);
  const pageSize = viewMode === 'grid' ? 12 : 10; // More items in grid view

  const debouncedSearch = useDebounce(search, 300);

  const { data: organizationFacilities = [] } = useQuery({
    queryKey: ['organization-facilities', organization?.id],
    queryFn: () => organizationsApi.listFacilities(organization!.id),
    enabled: organization !== null,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error } = usePatients({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    gender: gender || undefined,
    current_facility_only: currentFacilityOnly,
  });

  const facilityNameById = new Map(organizationFacilities.map((item) => [item.id, item.name]));
  const patients = (data?.results ?? []).map((patient) => ({
    ...patient,
    registered_at_facility_name:
      patient.registered_at_facility_name
      ?? (patient.registered_at_facility ? facilityNameById.get(patient.registered_at_facility) : null)
      ?? (patient.registered_at_facility === facility?.id ? (facility?.name ?? null) : null),
  }));

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

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 w-fit cursor-default rounded-md border px-3 py-2">
                <Switch
                  checked={currentFacilityOnly}
                  onCheckedChange={(checked) => {
                    setCurrentFacilityOnly(checked);
                    setPage(1);
                  }}
                />
                <span className="text-sm font-medium">
                  {currentFacilityOnly
                    ? (facility ? `${facility.name}` : 'Current Facility')
                    : 'All Organization Patients'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {currentFacilityOnly
                  ? 'Switch to all patients in this organization'
                  : `Switch to ${facility?.name ?? 'the current facility'} only`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Patient table/grid */}
      <PatientTable
        patients={patients}
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
