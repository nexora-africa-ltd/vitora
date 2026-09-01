'use client';

/**
 * LOINC Mapping Page
 *
 * Allows lab managers to manually assign LOINC codes to test catalog entries.
 * Shows all tests with their current LOINC assignment and provides inline
 * LOINC search/selection.
 *
 * Route: /laboratory/tests/loinc-mapping
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { LOINCSelect } from '@/components/terminology';
import { laboratoryApi } from '@/lib/api/laboratory';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Search, Check, X, FlaskConical, Link2 } from 'lucide-react';
import type { TestCatalogListItem } from '@/lib/types/laboratory';

export default function LOINCMappingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unmapped' | 'mapped'>('all');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['laboratoryTests', 'loinc-mapping'],
    queryFn: () => laboratoryApi.listTests({ page_size: 500, is_active: true }),
  });

  const tests = useMemo(() => {
    let items = data?.results || [];

    // Filter by search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.loinc_code && t.loinc_code.toLowerCase().includes(q))
      );
    }

    // Filter by mapping status
    if (filter === 'unmapped') {
      items = items.filter((t) => !t.loinc_code);
    } else if (filter === 'mapped') {
      items = items.filter((t) => !!t.loinc_code);
    }

    return items;
  }, [data?.results, debouncedSearch, filter]);

  const totalTests = data?.results?.length || 0;
  const mappedCount = data?.results?.filter((t) => !!t.loinc_code).length || 0;
  const unmappedCount = totalTests - mappedCount;

  const handleAssignLOINC = async (test: TestCatalogListItem, loincCode: string) => {
    setSaving(test.code);
    try {
      await laboratoryApi.updateTest(test.code, { loinc_code: loincCode });
      queryClient.invalidateQueries({ queryKey: ['laboratoryTests'] });
      toast({ title: 'LOINC assigned', description: `${test.name} → ${loincCode}` });
      setEditingCode(null);
    } catch {
      toast({ title: 'Failed to assign', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const handleClearLOINC = async (test: TestCatalogListItem) => {
    setSaving(test.code);
    try {
      await laboratoryApi.updateTest(test.code, { loinc_code: '' });
      queryClient.invalidateQueries({ queryKey: ['laboratoryTests'] });
      toast({ title: 'LOINC cleared', description: test.name });
    } catch {
      toast({ title: 'Failed to clear', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="LOINC Code Mapping"
        helpContent="Assign LOINC codes to test catalog entries for SHA claims, FHIR interoperability, and KHIS reporting. Tests without LOINC codes cannot be included in standardized lab reports."
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer" onClick={() => setFilter('all')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{totalTests}</p>
            <p className="text-xs text-muted-foreground">Total Tests</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('mapped')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{mappedCount}</p>
            <p className="text-xs text-muted-foreground">Mapped</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('unmapped')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{unmappedCount}</p>
            <p className="text-xs text-muted-foreground">Unmapped</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tests by name, code, or LOINC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'unmapped' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unmapped')}
          >
            Unmapped
          </Button>
          <Button
            variant={filter === 'mapped' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('mapped')}
          >
            Mapped
          </Button>
        </div>
      </div>

      {/* Test List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : tests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No tests found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tests.map((test) => (
            <Card key={test.code} className="p-3">
              <div className="flex items-center justify-between gap-4">
                {/* Test Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{test.name}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {test.code}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {test.category}
                    </Badge>
                  </div>
                </div>

                {/* LOINC Assignment */}
                <div className="flex shrink-0 items-center gap-2">
                  {editingCode === test.code ? (
                    <div className="flex w-[300px] items-center gap-2">
                      <LOINCSelect
                        value={test.loinc_code ? { code: test.loinc_code, name: '' } : null}
                        onSelect={(loinc) => handleAssignLOINC(test, loinc.code)}
                        placeholder="Search LOINC..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingCode(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : test.loinc_code ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 font-mono text-xs text-green-800 hover:bg-green-200">
                        <Check className="mr-1 h-3 w-3" />
                        {test.loinc_code}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditingCode(test.code)}
                        disabled={saving === test.code}
                      >
                        Change
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive"
                        onClick={() => handleClearLOINC(test)}
                        disabled={saving === test.code}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setEditingCode(test.code)}
                      disabled={saving === test.code}
                    >
                      <Link2 className="h-3 w-3" />
                      Assign LOINC
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
