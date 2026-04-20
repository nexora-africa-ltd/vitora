'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ShieldCheck, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';

const ACTIVE_STATUSES = ['SCHEDULED', 'PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU'];

export default function TheatreChecklistsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [cases, setCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch all active cases that may need checklist attention
      const data = await theatreApi.listCases({ search: search || undefined });
      setCases(data.results.filter(c => ACTIVE_STATUSES.includes(c.status)));
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    <PullToRefresh onRefresh={() => { refresh(); return fetchCases(); }} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="WHO Safety Checklists"
          helpContent="View active surgery cases and their WHO Safety Checklist status. Click a case to manage Sign-In, Time-Out, and Sign-Out phases."
        />

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cases..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : cases.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No active cases requiring checklists.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {cases.map(c => (
              <Card
                key={c.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/theatre/cases/${c.case_number}`)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <ClipboardCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.primary_procedure_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {c.patient_name} &middot; {c.case_number}
                    </p>
                  </div>
                  <Badge
                    className={`text-xs shrink-0 ${
                      c.status === 'IN_SURGERY' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                      : c.status === 'IN_THEATRE' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                    }`}
                  >
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
