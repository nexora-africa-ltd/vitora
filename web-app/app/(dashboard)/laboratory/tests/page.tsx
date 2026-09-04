'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { TestCatalogListItem, TestCategory } from '@/lib/types/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Plus, FlaskConical, Clock, Download, Link2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_TESTS: TestCatalogListItem[] = [];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'HEMATOLOGY', label: 'Hematology' },
  { value: 'CHEMISTRY', label: 'Clinical Chemistry' },
  { value: 'MICROBIOLOGY', label: 'Microbiology' },
  { value: 'SEROLOGY', label: 'Serology' },
  { value: 'PARASITOLOGY', label: 'Parasitology' },
  { value: 'IMMUNOLOGY', label: 'Immunology' },
  { value: 'URINALYSIS', label: 'Urinalysis' },
  { value: 'HISTOPATHOLOGY', label: 'Histopathology' },
  { value: 'CYTOLOGY', label: 'Cytology' },
  { value: 'MOLECULAR', label: 'Molecular Diagnostics' },
  { value: 'OTHER', label: 'Other' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(value);
}

export default function LaboratoryTestsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('laboratory.manage_catalog');
  const queryClient = useQueryClient();

  const testsQuery = useQuery({
    queryKey: ['laboratoryTests', { is_active: true, page: 1, page_size: 200 }],
    queryFn: async () => laboratoryApi.listTests({ is_active: true, page: 1, page_size: 200 }),
  });

  const seedMutation = useMutation({
    mutationFn: () => laboratoryApi.seedDefaults(),
    onSuccess: (data) => {
      toast.success(`Seeded ${data.created} default test(s)`);
      queryClient.invalidateQueries({ queryKey: ['laboratoryTests'] });
    },
    onError: () => {
      toast.error('Failed to seed default tests');
    },
  });

  const tests: TestCatalogListItem[] = testsQuery.data?.results ?? EMPTY_TESTS;
  const errorMessage = testsQuery.error instanceof Error ? testsQuery.error.message : null;
  const catalogEmpty = !testsQuery.isLoading && !errorMessage && tests.length === 0;

  const filtered = useMemo(() => {
    let result = tests;

    // Apply category filter
    if (categoryFilter !== 'ALL') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    // Apply text search
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((t) => {
        const name = (t.name || '').toLowerCase();
        const code = (t.code || '').toLowerCase();
        const shortName = (t.short_name || '').toLowerCase();
        return name.includes(query) || code.includes(query) || shortName.includes(query);
      });
    }
    return result;
  }, [search, categoryFilter, tests]);

  // Compute stats
  const totalTests = tests.length;
  const inHouseCount = tests.filter((t) => t.available_in_house).length;
  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Test Catalog"
          helpContent="Browse, search, and manage the laboratory test catalog. Configure reference ranges, pricing, result types, and availability."
          actions={
            canManage ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/laboratory/tests/loinc-mapping')}
                >
                  <Link2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">LOINC Mapping</span>
                </Button>
                <Button onClick={() => router.push('/laboratory/tests/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Test</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </div>
            ) : undefined
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{totalTests}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">In-House</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{inHouseCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Catalog</CardTitle>
              <HelpPopover content="Search by test name, code, or LOINC. Click a row to view details and configure reference ranges." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="max-w-md flex-1 space-y-2">
                <Label htmlFor="lab-tests-search">Search</Label>
                <Input
                  id="lab-tests-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, code, or LOINC..."
                />
              </div>
              <div className="w-full space-y-2 sm:w-48">
                <Label htmlFor="category-filter">Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger id="category-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {testsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : errorMessage ? (
              <div className="text-sm text-destructive">{errorMessage}</div>
            ) : catalogEmpty ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-1 text-lg font-medium">No tests in catalog</h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  {canManage
                    ? 'Seed the catalog with 16 essential laboratory tests (CBC, HIV, Malaria, Urinalysis, etc.) to get started.'
                    : 'No tests have been configured yet. Ask an administrator to seed the test catalog.'}
                </p>
                {canManage && (
                  <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    <Download className="mr-2 h-4 w-4" />
                    {seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}
                  </Button>
                )}
              </div>
            ) : (
              <ResponsiveTable
                data={filtered}
                keyExtractor={(t) => t.id}
                onRowClick={(t) => router.push(`/laboratory/tests/${t.code}`)}
                emptyMessage="No tests match your search."
                defaultSortColumn="name"
                defaultSortDirection="asc"
                columns={[
                  {
                    key: 'name',
                    header: 'Test Name',
                    sortable: true,
                    cell: (t) => (
                      <div>
                        <span className="font-medium">{t.name}</span>
                        {t.requires_fasting && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Fasting
                          </Badge>
                        )}
                      </div>
                    ),
                  },
                  { key: 'code', header: 'Code', sortable: true },
                  {
                    key: 'loinc_code',
                    header: 'LOINC',
                    sortable: true,
                    hideOnMobile: true,
                    cell: (t) => (
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.loinc_code || '-'}
                      </span>
                    ),
                  },
                  { key: 'category', header: 'Category', sortable: true, hideOnMobile: true },
                  { key: 'specimen_type', header: 'Specimen', sortable: true, hideOnMobile: true },
                  {
                    key: 'result_type',
                    header: 'Result Type',
                    sortable: true,
                    hideOnMobile: true,
                    cell: (t) => (
                      <span className="text-sm">
                        {t.result_type}
                        {t.result_unit ? ` (${t.result_unit})` : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'cost',
                    header: 'Cost',
                    sortable: true,
                    sortType: 'number' as const,
                    hideOnMobile: true,
                    cell: (t) => <div className="text-sm">{formatCurrency(t.cost)}</div>,
                  },
                  {
                    key: 'turnaround_hours',
                    header: 'TAT',
                    sortable: true,
                    sortType: 'number' as const,
                    hideOnMobile: true,
                    cell: (t) => (
                      <span className="text-sm text-muted-foreground">
                        {t.turnaround_hours ? `${t.turnaround_hours}h` : '-'}
                      </span>
                    ),
                  },
                ]}
                mobileCard={(t) => (
                  <Card className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {t.code} • {t.category}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {t.result_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t.specimen_type}</span>
                      <span>{formatCurrency(t.cost)}</span>
                      {t.requires_fasting && (
                        <Badge variant="outline" className="text-xs">
                          Fasting
                        </Badge>
                      )}
                    </div>
                  </Card>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}
