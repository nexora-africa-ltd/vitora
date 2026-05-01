'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText, AlertTriangle, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { apiClient } from '@/lib/api/client';

interface Intervention {
  code: string;
  name: string;
  description?: string;
  category: string;
  price: number | string;
  facility_level: number | string;
  requires_preauthorization?: boolean;
  is_active: boolean;
}

interface Props {
  facilityLevel: string;
}

const PAGE_SIZE = 50;

export function FacilityInterventionsPanel({ facilityLevel }: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const level = parseInt(facilityLevel);

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['facility-interventions', level, search, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('facility_level', String(level));
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((page - 1) * PAGE_SIZE));
      if (search.length >= 2) {
        params.set('search', search);
      }
      const response = await apiClient.get(
        `/api/billing/terminology/interventions/?${params.toString()}`
      );
      return response.data as { results: Intervention[]; count: number };
    },
    enabled: !isNaN(level),
    staleTime: 10 * 60 * 1000, // 10 min
  });

  const interventions = data?.results ?? [];
  const total = data?.count ?? 0;

  if (isLoading) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <CardTitle className="text-base">SHA Interventions &amp; Tariffs</CardTitle>
            <HelpPopover content="SHA Benefits & Interventions available at this facility's KEPH level. Tariffs shown are the SHA reimbursement amounts." />
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total} available
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search interventions..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load interventions.</span>
          </div>
        ) : interventions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search.length >= 2
              ? 'No interventions match your search.'
              : 'No interventions available for this facility level.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Intervention</th>
                  <th className="pb-2 pr-4 font-medium hidden sm:table-cell">Category</th>
                  <th className="pb-2 pr-4 font-medium text-right">Tariff (KES)</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Pre-auth</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {interventions.map((item) => (
                  <tr key={item.code} className="hover:bg-muted/50">
                    <td className="py-2 pr-4 font-mono text-xs">{item.code}</td>
                    <td className="py-2 pr-4 max-w-[200px] sm:max-w-[300px] truncate">
                      {item.name}
                    </td>
                    <td className="py-2 pr-4 hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-right font-medium tabular-nums">
                      {typeof item.price === 'number'
                        ? item.price.toLocaleString()
                        : Number(item.price).toLocaleString()}
                    </td>
                    <td className="py-2 hidden md:table-cell">
                      {item.requires_preauthorization && (
                        <ShieldAlert className="h-4 w-4 text-amber-500" aria-label="Requires pre-authorization" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2 text-muted-foreground">
                {page} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
