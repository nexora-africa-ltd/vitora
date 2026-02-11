'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { TestCatalogListItem } from '@/lib/types/laboratory';

export default function LaboratoryTestsPage() {
  const [search, setSearch] = useState('');
  const [tests, setTests] = useState<TestCatalogListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await laboratoryApi.listTests({ is_active: true, page: 1, page_size: 50 });
        if (!cancelled) {
          setTests(response.results || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load lab tests');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tests;
    return tests.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const code = (t.code || '').toLowerCase();
      const shortName = (t.short_name || '').toLowerCase();
      return name.includes(query) || code.includes(query) || shortName.includes(query);
    });
  }, [search, tests]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Laboratory Tests</h1>
        <p className="text-muted-foreground">Browse and search the lab test catalog (including LOINC codes)</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>Search by test name, code, or LOINC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="lab-tests-search">Search</Label>
            <Input
              id="lab-tests-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests by name, code, or LOINC..."
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Specimen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.code}</TableCell>
                    <TableCell>{t.category}</TableCell>
                    <TableCell>{t.specimen_type}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No tests match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
