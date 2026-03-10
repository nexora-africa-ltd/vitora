'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClinicalWorkflowCounts } from '@/lib/hooks';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { resolveClinicalWorkflowItems } from '@/lib/config/clinical-navigation';

const workflowCountKeyById = {
  'waiting-for-triage': 'waitingForTriage',
  'waiting-for-consult': 'waitingForConsult',
  'in-progress': 'inProgress',
  'pending-results': 'pendingResults',
  'ready-to-close': 'readyToClose',
  'completed-today': 'completedToday',
} as const;

export default function ClinicalWorkflowPage() {
  const { canAccessModule, canPerformAction } = usePermissions();
  const { hasModule } = useFacility();
  const { counts, isLoading } = useClinicalWorkflowCounts();

  const workflowItems = resolveClinicalWorkflowItems({
    canAccessModule,
    canPerformAction,
    hasModule,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Today's Queue"
        helpContent="Start from workflow buckets that mirror the patient journey. Cards only appear when your role and facility can already access the underlying destination."
      />

      <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-card">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Workflow-first clinical navigation</p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              This hub keeps the current permission and facility capability model intact while surfacing the queues clinicians use most often.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-cyan-600" />
              Access stays aligned with RBAC and enabled facility modules.
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-sm text-foreground">
              <span className="font-medium">Open Work</span>
              <Badge variant="secondary">{isLoading ? '...' : counts.openWork}</Badge>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-sm text-foreground">
              <span className="font-medium">Completed Today</span>
              <Badge variant="secondary">{isLoading ? '...' : counts.completedToday}</Badge>
            </div>
          </div>
        </div>
      </div>

      {workflowItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-base font-medium text-foreground">No clinical workflow queues are available.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your current role or facility configuration does not expose any workflow destinations yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflowItems.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.id} className="relative overflow-hidden border-border/70">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardHeader className="relative pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{item.label}</CardTitle>
                        <Badge variant="secondary">
                          {isLoading
                            ? '...'
                            : counts[workflowCountKeyById[item.id as keyof typeof workflowCountKeyById]]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative space-y-4">
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  <Button asChild className="w-full justify-between sm:w-auto">
                    <Link href={item.href}>
                      Open queue
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}