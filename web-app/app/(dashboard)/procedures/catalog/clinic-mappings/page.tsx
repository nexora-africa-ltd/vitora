'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Loader2, Search, Syringe, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { proceduresApi } from '@/lib/api/procedures';
import { useClinics } from '@/lib/hooks/use-clinics';
import { getApiErrorMessage } from '@/lib/api/client';
import { toast } from '@/lib/hooks/use-toast';
import { getClinicTypesForCategory, getAllProcedureClinicTypes } from '@/lib/config/procedure-clinic-mapping';
import { useQuery } from '@tanstack/react-query';

const PAGE_SIZE = 20;

/** Lightweight type matching the list serializer shape */
interface CatalogListEntry {
  id: number;
  code: string;
  name: string;
  category: string;
  is_active: boolean;
  default_clinics: number[];
  default_clinics_detail: { id: number; name: string; clinic_type: string }[];
}

// =============================================================================
// Main Page
// =============================================================================

export default function ClinicMappingsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pendingChanges, setPendingChanges] = useState<Record<number, number[]>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  // Debounce search input
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[0] = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  };

  // Build query params for server-side pagination + filtering
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(PAGE_SIZE),
      is_active: 'true',
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (categoryFilter !== 'ALL') params.category = categoryFilter;
    return params;
  }, [page, debouncedSearch, categoryFilter]);

  // Fetch catalog entries (server-paginated)
  const { data: catalogData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['procedures', 'catalog', 'clinic-mappings', queryParams],
    queryFn: () => proceduresApi.listCatalog(queryParams),
    placeholderData: (prev) => prev,
  });

  // Fetch procedure-type clinics
  const { data: clinicsData, isLoading: isClinicsLoading } = useClinics({
    status: 'ACTIVE',
    page_size: 100,
  });

  // All clinic types that could be relevant to any procedure
  const allProcedureClinicTypes = getAllProcedureClinicTypes();

  const allProcedureClinics = useMemo(
    () => (clinicsData?.results ?? []).filter((c) => allProcedureClinicTypes.includes(c.clinic_type)),
    [clinicsData, allProcedureClinicTypes]
  );

  // Per-entry: get clinics relevant to that procedure's category
  const getClinicsForCategory = useCallback(
    (category: string) => {
      const types = getClinicTypesForCategory(category);
      return (clinicsData?.results ?? []).filter((c) => types.includes(c.clinic_type));
    },
    [clinicsData]
  );

  const catalogEntries: CatalogListEntry[] = (catalogData?.results ?? []).map((e) => ({
    ...e,
    default_clinics: e.default_clinics ?? [],
    default_clinics_detail: e.default_clinics_detail ?? [],
  }));

  const totalCount = catalogData?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = !!catalogData?.next;
  const hasPrev = page > 1;

  // Derive unique categories for the filter (fetch all just for the dropdown)
  const { data: allCatalogData } = useQuery({
    queryKey: ['procedures', 'catalog', 'categories'],
    queryFn: () => proceduresApi.listCatalog({ page_size: '500', is_active: 'true' }),
    staleTime: 300000,
  });
  const categories = useMemo(() => {
    const results = allCatalogData?.results ?? [];
    const cats = new Set(results.map((e: { category: string }) => e.category));
    return Array.from(cats).sort();
  }, [allCatalogData]);

  // Get current clinic IDs for an entry (pending changes or original)
  const getClinicIds = (entry: CatalogListEntry): number[] => {
    const pending = pendingChanges[entry.id];
    if (pending !== undefined) {
      return pending;
    }
    return entry.default_clinics ?? [];
  };

  const hasChanges = (entryId: number) => pendingChanges[entryId] !== undefined;

  const addClinic = (entry: CatalogListEntry, clinicId: number) => {
    const current = getClinicIds(entry);
    if (!current.includes(clinicId)) {
      setPendingChanges((prev) => ({ ...prev, [entry.id]: [...current, clinicId] }));
    }
  };

  const removeClinic = (entry: CatalogListEntry, clinicId: number) => {
    const current = getClinicIds(entry);
    setPendingChanges((prev) => ({
      ...prev,
      [entry.id]: current.filter((id) => id !== clinicId),
    }));
  };

  const discardChanges = (entryId: number) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  const saveEntry = async (entry: CatalogListEntry) => {
    const clinicIds = pendingChanges[entry.id];
    if (clinicIds === undefined) return;

    setSavingIds((prev) => new Set(prev).add(entry.id));
    try {
      await proceduresApi.updateCatalogEntry(entry.id, { default_clinics: clinicIds });
      toast({ title: `Updated ${entry.name}` });
      // Remove from pending
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['procedures', 'catalog'] });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const saveAllPending = async () => {
    const entries = catalogEntries.filter((e) => pendingChanges[e.id] !== undefined);
    for (const entry of entries) {
      await saveEntry(entry);
    }
  };

  const pendingCount = Object.keys(pendingChanges).length;
  const isLoading = isCatalogLoading || isClinicsLoading;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Procedure Room Assignments"
        helpContent="Assign procedure-type clinics to catalog entries. Procedures with assigned clinics will show available time slots during scheduling. Procedures without assignments use manual scheduling."
        actions={
          pendingCount > 0 ? (
            <Button onClick={saveAllPending} disabled={savingIds.size > 0}>
              {savingIds.size > 0 && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save All ({pendingCount})
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search procedures..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {allProcedureClinics.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {allProcedureClinics.length} clinic{allProcedureClinics.length !== 1 ? 's' : ''} available for procedures
          </div>
        )}
      </div>

      {/* Info banner when no procedure clinics exist */}
      {!isLoading && allProcedureClinics.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No procedure-compatible clinics found. Create clinics with type <strong>Procedure Room</strong>,{' '}
              <strong>Dental</strong>, <strong>Eye</strong>, <strong>ENT</strong>, <strong>Surgical</strong>, or{' '}
              other specialized types to enable automatic slot-based scheduling.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {/* Procedure list */}
      {!isLoading && (
        <div className="space-y-2">
          {catalogEntries.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {debouncedSearch || categoryFilter !== 'ALL'
                  ? 'No procedures match your filters.'
                  : 'No active procedures in the catalog.'}
              </CardContent>
            </Card>
          )}

          {catalogEntries.map((entry) => {
            const clinicIds = getClinicIds(entry);
            const categoryClinics = getClinicsForCategory(entry.category);
            const selectedClinics = categoryClinics.filter((c) => clinicIds.includes(c.id));
            // Also include already-selected clinics that might not match current category
            const allClinics = clinicsData?.results ?? [];
            const extraSelected = allClinics.filter(
              (c) => clinicIds.includes(c.id) && !categoryClinics.some((cc) => cc.id === c.id)
            );
            const allSelectedClinics = [...selectedClinics, ...extraSelected];
            const availableClinics = categoryClinics.filter((c) => !clinicIds.includes(c.id));
            const changed = hasChanges(entry.id);
            const isSaving = savingIds.has(entry.id);

            return (
              <Card
                key={entry.id}
                className={changed ? 'border-primary/40 bg-primary/[0.02]' : ''}
              >
                <CardContent className="py-3 px-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left: procedure info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Syringe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{entry.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{entry.code}</span>
                        <Badge variant="outline" className="text-xs">
                          {entry.category.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      {/* Assigned clinics */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {allSelectedClinics.map((clinic) => (
                          <Badge key={clinic.id} variant="secondary" className="gap-1 pr-1 text-xs">
                            {clinic.name}
                            <button
                              type="button"
                              onClick={() => removeClinic(entry, clinic.id)}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                              aria-label={`Remove ${clinic.name}`}
                              disabled={isSaving}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {clinicIds.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">Manual scheduling</span>
                        )}
                      </div>
                    </div>

                    {/* Right: add clinic + save */}
                    <div className="flex items-center gap-2 shrink-0">
                      {availableClinics.length > 0 && (
                        <Select
                          onValueChange={(val) => addClinic(entry, Number(val))}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="w-44 h-8 text-xs">
                            <SelectValue placeholder="Add room..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableClinics.map((clinic) => (
                              <SelectItem key={clinic.id} value={String(clinic.id)}>
                                {clinic.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {changed && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => discardChanges(entry.id)}
                            disabled={isSaving}
                            className="h-8"
                          >
                            Undo
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEntry(entry)}
                            disabled={isSaving}
                            className="h-8"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrev}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} procedure{totalCount !== 1 ? 's' : ''})
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
