'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileHeart, Syringe } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';

const ACTIVE_CASE_STATUSES = ['SCHEDULED', 'PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU'];

export default function TheatreAnesthesiaPage() {
  const [cases, setCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    theatreApi.listCases({ page_size: 200 }).then((response) => {
      if (!mounted) return;
      setCases(response.results.filter((item) => ACTIVE_CASE_STATUSES.includes(item.status)));
    }).catch(() => {
      if (!mounted) return;
      setCases([]);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const grouped = useMemo(() => ({
    preOp: cases.filter((item) => ['SCHEDULED', 'PRE_OP'].includes(item.status)),
    intraOp: cases.filter((item) => ['IN_THEATRE', 'IN_SURGERY'].includes(item.status)),
    pacu: cases.filter((item) => item.status === 'IN_PACU'),
  }), [cases]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anesthesia Workspace"
        helpContent="Review theatre cases that require anesthesia documentation and jump directly into the relevant case workspace."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Pre-Op Assessments', grouped.preOp.length],
          ['Intra-Op Cases', grouped.intraOp.length],
          ['PACU Handover', grouped.pacu.length],
        ].map(([label, count]) => (
          <Card key={label} className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Syringe className="h-4 w-4" />Case Queue</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading anesthesia queue...</div>
          ) : cases.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No active theatre cases currently need anesthesia follow-up.</div>
          ) : (
            <div className="space-y-3">
              {cases.map((item) => {
                const targetHref = item.status === 'IN_PACU'
                  ? `/theatre/cases/${item.case_number}/post-op`
                  : item.status === 'IN_THEATRE' || item.status === 'IN_SURGERY'
                    ? `/theatre/cases/${item.case_number}/intra-op`
                    : `/theatre/cases/${item.case_number}/pre-op`;
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.primary_procedure_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{item.patient_name} · {item.case_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" size="sm" className="w-fit">{item.status.replace(/_/g, ' ')}</Badge>
                      <Button asChild size="sm">
                        <Link href={targetHref}>
                          <FileHeart className="mr-2 h-4 w-4" />Open workspace
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
