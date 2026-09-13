'use client';

import { Fragment, useState, useDeferredValue } from 'react';
import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search,
  FileText,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { apiClient } from '@/lib/api/client';
import { facilitiesApi } from '@/lib/api/facilities';

interface Intervention {
  code: string;
  name: string;
  description?: string;
  category: string;
  price: number | string;
  facility_level: number | string;
  payment_mechanism?: string | null;
  access_point?: string | null;
  benefit_code?: string | null;
  raw_data?: Record<string, unknown>;
  requires_preauthorization?: boolean;
  is_active: boolean;
  max_amount_per_test?: string | null;
  quantity_per_year?: string | null;
}

interface Props {
  facilityLevel: string;
  facilityId: number;
}

const PAGE_SIZE = 50;

function paymentMechanismLabel(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '—';
  const normalized = raw.toLowerCase();
  if (normalized.includes('capitation')) return 'Capitation';
  if (normalized.includes('per diem') || normalized.includes('per_diem')) return 'Per Diem';
  if (normalized.includes('fixed fee for service')) return 'POMSF';
  if (normalized.includes('fee for service')) return 'FFS';
  return raw;
}

export function FacilityInterventionsPanel({ facilityLevel, facilityId }: Props) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const level = parseInt(facilityLevel);

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    setExpandedCodes(new Set());
  };

  const toggleExpanded = (code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['facility-interventions', level, deferredSearch, page],
    queryFn: async () => {
      const normalizedSearch = deferredSearch.trim();
      const params = new URLSearchParams();
      params.set('facility_level', String(level));
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((page - 1) * PAGE_SIZE));
      if (normalizedSearch.length > 0) {
        params.set('search', normalizedSearch);
      }
      const response = await apiClient.get(
        `/api/billing/terminology/interventions/?${params.toString()}`
      );
      return response.data as { results: Intervention[]; count: number };
    },
    enabled: !isNaN(level),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000, // 10 min
  });

  const syncServicesMutation = useMutation({
    mutationFn: () => facilitiesApi.syncBillingServices(facilityId),
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
          <div className="flex items-center gap-2">
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total} available
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncServicesMutation.mutate()}
              disabled={syncServicesMutation.isPending}
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${syncServicesMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync to Billing Services
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        {syncServicesMutation.isError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Failed to sync billing services:{' '}
              {syncServicesMutation.error instanceof Error
                ? syncServicesMutation.error.message
                : 'Unknown error'}
            </span>
          </div>
        )}

        {syncServicesMutation.isSuccess && (
          <div className="text-sm text-muted-foreground">
            Synced billing services: created {syncServicesMutation.data.created}, updated{' '}
            {syncServicesMutation.data.updated}, skipped {syncServicesMutation.data.skipped}.
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search interventions..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {isFetching && !isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load interventions.</span>
          </div>
        ) : interventions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {search.trim().length > 0
              ? 'No interventions match your search.'
              : 'No interventions available for this facility level.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="hidden w-[48px] pb-2 pr-2 font-medium md:table-cell">More</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Intervention</th>
                  <th className="hidden pb-2 pr-4 font-medium sm:table-cell">Category</th>
                  <th className="hidden pb-2 pr-4 font-medium md:table-cell">Payment</th>
                  <th className="pb-2 pr-4 text-right font-medium">Tariff (KES)</th>
                  <th className="hidden pb-2 pr-4 text-right font-medium lg:table-cell">
                    Max/Test
                  </th>
                  <th className="hidden pb-2 pr-4 text-right font-medium lg:table-cell">
                    Qty/Year
                  </th>
                  <th className="hidden pb-2 font-medium md:table-cell">Pre-auth</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {interventions.map((item) => (
                  <Fragment key={item.code}>
                    <tr key={item.code} className="hover:bg-muted/50">
                      <td className="hidden py-2 pr-2 md:table-cell">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleExpanded(item.code)}
                          aria-label={expandedCodes.has(item.code) ? 'Collapse row' : 'Expand row'}
                        >
                          {expandedCodes.has(item.code) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{item.code}</td>
                      <td className="max-w-[200px] truncate py-2 pr-4 sm:max-w-[300px]">
                        {item.name}
                      </td>
                      <td className="hidden py-2 pr-4 sm:table-cell">
                        {item.category && (
                          <Badge variant="outline" className="text-xs">
                            {item.category}
                          </Badge>
                        )}
                      </td>
                      <td className="hidden py-2 pr-4 md:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {paymentMechanismLabel(item.payment_mechanism)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums">
                        {item.price
                          ? typeof item.price === 'number'
                            ? item.price.toLocaleString()
                            : Number(item.price).toLocaleString()
                          : '—'}
                      </td>
                      <td className="hidden py-2 pr-4 text-right tabular-nums lg:table-cell">
                        {item.max_amount_per_test
                          ? Number(item.max_amount_per_test).toLocaleString()
                          : '—'}
                      </td>
                      <td className="hidden py-2 pr-4 text-right tabular-nums lg:table-cell">
                        {item.quantity_per_year ?? '—'}
                      </td>
                      <td className="hidden py-2 md:table-cell">
                        {item.requires_preauthorization && (
                          <ShieldAlert
                            className="h-4 w-4 text-amber-500"
                            aria-label="Requires pre-authorization"
                          />
                        )}
                      </td>
                    </tr>
                    {expandedCodes.has(item.code) && (
                      <tr className="hidden bg-muted/30 md:table-row">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 text-xs lg:grid-cols-4">
                            <div>
                              <p className="text-muted-foreground">Description</p>
                              <p className="break-words font-medium">{item.description || '—'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Benefit Code</p>
                              <p className="font-medium">{item.benefit_code || '—'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Access Point</p>
                              <p className="font-medium">{item.access_point || '—'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Applicable Gender</p>
                              <p className="font-medium">
                                {typeof item.raw_data?.applicable_gender === 'string'
                                  ? item.raw_data.applicable_gender
                                  : 'ALL'}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
              <span className="px-2 text-xs text-muted-foreground">
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
