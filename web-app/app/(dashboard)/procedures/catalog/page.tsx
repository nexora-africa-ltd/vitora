'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Syringe } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { proceduresApi } from '@/lib/api/procedures';
import { formatCurrency } from '@/lib/utils/format';
import type { ProcedureCatalogEntry } from '@/lib/types/procedure';
import { RISK_LEVEL_COLORS } from '@/lib/types/procedure';

const CATEGORY_LABELS: Record<string, string> = {
  MINOR: 'Minor Procedure',
  DIAGNOSTIC: 'Diagnostic',
  THERAPEUTIC: 'Therapeutic',
  PREVENTIVE: 'Preventive',
  EMERGENCY: 'Emergency',
  DENTAL: 'Dental',
  OPHTHALMIC: 'Ophthalmic',
  ENT: 'ENT',
  OBSTETRIC: 'Obstetric',
  WOUND_CARE: 'Wound Care',
  INJECTION: 'Injection/Infusion',
  OTHER: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  MINOR: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  DIAGNOSTIC: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  THERAPEUTIC: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  PREVENTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  DENTAL: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  OPHTHALMIC: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  ENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  OBSTETRIC: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  WOUND_CARE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  INJECTION: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function ProcedureCatalogPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<string>('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['procedure-catalog', debouncedSearch, categoryFilter, riskFilter],
    queryFn: () =>
      proceduresApi.listCatalog({
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(riskFilter ? { risk_level: riskFilter } : {}),
        is_active: 'true',
        ordering: 'category,name',
      }),
    staleTime: 60000,
  });

  const catalog = useMemo(() => (data?.results || []) as ProcedureCatalogEntry[], [data]);

  const columns = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      cell: (item: ProcedureCatalogEntry) => (
        <span className="font-mono text-sm">{item.code}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'name',
      header: 'Procedure',
      sortable: true,
      cell: (item: ProcedureCatalogEntry) => (
        <div>
          <span className="font-medium">{item.name}</span>
          {item.ichi_code && (
            <span className="text-xs text-muted-foreground ml-2">ICHI: {item.ichi_code}</span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      cell: (item: ProcedureCatalogEntry) => (
        <Badge className={`${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.OTHER} shrink-0 w-fit`}>
          {CATEGORY_LABELS[item.category] || item.category}
        </Badge>
      ),
    },
    {
      key: 'risk_level',
      header: 'Risk',
      sortable: true,
      cell: (item: ProcedureCatalogEntry) => (
        <Badge className={`${RISK_LEVEL_COLORS[item.risk_level] || ''} shrink-0 w-fit`}>
          {item.risk_level}
        </Badge>
      ),
    },
    {
      key: 'typical_duration_minutes',
      header: 'Duration',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: ProcedureCatalogEntry) => `${item.typical_duration_minutes} min`,
      hideOnMobile: true,
    },
    {
      key: 'base_fee',
      header: 'Fee (KES)',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: ProcedureCatalogEntry) =>
        item.base_fee != null ? formatCurrency(item.base_fee) : '—',
      hideOnMobile: true,
    },
    {
      key: 'consent_required',
      header: 'Consent',
      sortable: true,
      cell: (item: ProcedureCatalogEntry) => (
        <span className={item.consent_required ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
          {item.consent_required ? 'Required' : 'No'}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Procedure Catalog"
          helpContent="Browse all available procedures. Filter by category and risk level. View procedure codes, fees, and consent requirements."
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, ICHI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Catalog Table */}
        <ResponsiveTable
          data={catalog}
          columns={columns}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage="No procedures found"
          defaultSortColumn="name"
          defaultSortDirection="asc"
        />
      </div>
    </PullToRefresh>
  );
}
