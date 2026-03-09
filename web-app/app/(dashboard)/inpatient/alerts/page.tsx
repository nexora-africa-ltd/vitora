'use client';

import { useIsSupervisor } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { SupervisorAlertsPanel, ConstraintOverrideMetrics } from '@/components/inpatient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  LockKeyhole,
  ShieldAlert,
  Siren,
} from 'lucide-react';

const oversightHighlights = [
  {
    icon: Siren,
    title: 'Escalate critical overrides',
    description: 'Keep unresolved capacity and placement exceptions visible until a supervisor reviews them.',
  },
  {
    icon: Activity,
    title: 'Watch repeat patterns',
    description: 'Use ward and violation trends to spot operational strain before it becomes routine.',
  },
  {
    icon: ClipboardCheck,
    title: 'Stay audit ready',
    description: 'Document acknowledgement notes so exception handling remains defensible during compliance review.',
  },
];

const supervisorChecklist = [
  'Review pending critical overrides at the start of each shift handover.',
  'Check whether the same ward or constraint type is appearing repeatedly.',
  'Capture concise acknowledgement notes when approving exceptional placement decisions.',
];

export default function SupervisorAlertsPage() {
  const isSupervisor = useIsSupervisor();

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Supervisor Alerts"
        helpContent="Review and acknowledge critical constraint violations that were overridden during patient admissions. Monitor override metrics to identify patterns."
      />

      <section className="relative overflow-hidden rounded-3xl border border-primary/10 bg-card p-5 shadow-sm sm:p-6 lg:p-7">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"
          aria-hidden="true"
        />
        <div className="relative space-y-5">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit border-primary/30 bg-background/80 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Inpatient Oversight
            </Badge>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20 sm:flex">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Keep high-risk admission overrides visible, owned, and explainable.
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    This workspace combines live exception review with override trend monitoring so supervisors can clear urgent issues quickly and still spot the systemic patterns behind them.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {oversightHighlights.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-primary/10 bg-background/80 p-4 backdrop-blur-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!isSupervisor && (
        <Alert className="border-amber-300/50 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Limited Access</AlertTitle>
          <AlertDescription>
            Full alert acknowledgment features require supervisor permissions.
            Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <SupervisorAlertsPanel className="border-primary/10 shadow-sm" />

        <ConstraintOverrideMetrics className="border-primary/10 shadow-sm" />

        <Card className="overflow-hidden border-primary/10 shadow-sm">
          <CardContent className="relative p-0">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_38%)]"
              aria-hidden="true"
            />
            <div className="relative p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <p className="text-base font-semibold tracking-tight text-foreground sm:text-xl">Supervisor review checklist</p>
                <HelpPopover content="Use the alert feed for urgent acknowledgement, then confirm the reason, ward context, and review note are all clear enough for follow-up." />
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {supervisorChecklist.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-background/70 px-3 py-3"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                Repeated override patterns usually signal a ward configuration, staffing, or escalation process problem rather than isolated admission decisions.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
