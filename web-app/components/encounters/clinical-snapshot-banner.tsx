'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounterClinicalSnapshot } from '@/lib/hooks/use-encounters';

function SnapshotSection({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClinicalSnapshotBanner({ encounterId }: { encounterId: number }) {
  const [open, setOpen] = useState(true);
  const { data: snapshot, isLoading, isError } = useEncounterClinicalSnapshot(encounterId);

  const isSevereAllergy = useMemo(() => {
    return !!snapshot?.alerts?.some((alert) => alert.toUpperCase().includes('SEVERE ALLERGY'));
  }, [snapshot]);

  if (isLoading) {
    return (
      <Card className="border-2 border-muted">
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2 min-w-0 flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  // Non-blocking: encounter view should still load even if snapshot fails.
  if (isError || !snapshot) return null;

  const cardTone = isSevereAllergy
    ? 'border-destructive/30 bg-destructive/5'
    : 'border-primary/20';

  return (
    <Card className={cn('border-2', cardTone)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle
                  className={cn(
                    'h-4 w-4',
                    isSevereAllergy ? 'text-destructive' : 'text-muted-foreground'
                  )}
                />
                <CardTitle className="text-base sm:text-lg">Clinical Snapshot</CardTitle>
                {isSevereAllergy && (
                  <Badge variant="destructive" className="shrink-0 w-fit">
                    Allergy alert
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                <span>Allergies: {snapshot.allergies.length}</span>
                <span>Conditions: {snapshot.active_conditions.length}</span>
                <span>Meds: {snapshot.current_medications.length}</span>
                <span>Pending: {snapshot.pending_results.length}</span>
              </div>
            </div>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0">
                {open ? (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4 mr-1" />
                    Show
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 sm:px-6 pb-4 space-y-4">
            {snapshot.alerts.length > 0 && (
              <div
                className={cn(
                  'rounded-md border p-3',
                  isSevereAllergy
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-muted bg-muted/30'
                )}
              >
                <ul className="space-y-1 text-sm">
                  {snapshot.alerts.map((alert) => (
                    <li key={alert} className="break-words">
                      {alert}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SnapshotSection
                title="Allergies"
                items={snapshot.allergies}
                emptyLabel="No recorded allergies"
              />
              <SnapshotSection
                title="Active Conditions"
                items={snapshot.active_conditions}
                emptyLabel="No active conditions recorded"
              />
              <SnapshotSection
                title="Current Medications"
                items={snapshot.current_medications}
                emptyLabel="No current medications recorded"
              />
            </div>

            {snapshot.pending_results.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Pending Results</h4>
                <ul className="space-y-1 text-sm">
                  {snapshot.pending_results.map((r, idx) => (
                    <li key={`${r.test_name}-${r.ordered_date ?? 'unknown'}-${idx}`} className="break-words">
                      {r.test_name}
                      <span className="text-muted-foreground">{' '}(status: {r.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
