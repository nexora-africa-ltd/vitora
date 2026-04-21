'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ClipboardCheck, Loader2, MonitorPlay, Stethoscope, TimerReset } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseDetail } from '@/lib/types/theatre';
import { PreOpWorkspace } from '@/components/theatre/pre-op-workspace';
import { IntraOpWorkspace } from '@/components/theatre/intra-op-workspace';
import { PostOpWorkspace } from '@/components/theatre/post-op-workspace';
import { TheatreCasePriorityBadge, TheatreCaseStatusBadge } from '@/components/theatre/theatre-display';

type TheatreWorkspaceRoute = 'pre-op' | 'intra-op' | 'post-op';

const WORKSPACE_CONFIG: Record<
  TheatreWorkspaceRoute,
  {
    label: string;
    helpContent: string;
    icon: React.ElementType;
    expectedStatuses: string[];
  }
> = {
  'pre-op': {
    label: 'Pre-Op Workspace',
    helpContent: 'Capture surgical readiness, WHO Sign-In, consent, labs, and anesthesia assessment for this case.',
    icon: ClipboardCheck,
    expectedStatuses: ['SCHEDULED', 'PRE_OP'],
  },
  'intra-op': {
    label: 'Intra-Op Workspace',
    helpContent: 'Document WHO pauses, intra-operative anesthesia events, operative findings, and consumables for this case.',
    icon: MonitorPlay,
    expectedStatuses: ['IN_THEATRE', 'IN_SURGERY'],
  },
  'post-op': {
    label: 'Post-Op Workspace',
    helpContent: 'Track PACU monitoring, recovery trends, and discharge readiness for this case.',
    icon: TimerReset,
    expectedStatuses: ['IN_PACU', 'DISCHARGED'],
  },
};

function renderWorkspace(
  workspace: TheatreWorkspaceRoute,
  surgeryCase: SurgeryCaseDetail,
  onCaseRefresh: () => Promise<void>
) {
  if (workspace === 'pre-op') {
    return <PreOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={onCaseRefresh} />;
  }
  if (workspace === 'intra-op') {
    return <IntraOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={onCaseRefresh} />;
  }
  return <PostOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={onCaseRefresh} />;
}

export function TheatreCaseWorkspacePage({ workspace }: { workspace: TheatreWorkspaceRoute }) {
  const { caseNumber } = useParams<{ caseNumber: string }>();
  const [surgeryCase, setSurgeryCase] = useState<SurgeryCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const config = WORKSPACE_CONFIG[workspace];

  const fetchCase = useCallback(async () => {
    if (!caseNumber) return;
    try {
      setLoading(true);
      const detail = await theatreApi.getCase(caseNumber);
      setSurgeryCase(detail);
    } catch {
      setSurgeryCase(null);
    } finally {
      setLoading(false);
    }
  }, [caseNumber]);

  useEffect(() => {
    void fetchCase();
  }, [fetchCase]);

  const statusAligned = useMemo(
    () => (surgeryCase ? config.expectedStatuses.includes(surgeryCase.status) : true),
    [config.expectedStatuses, surgeryCase]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!surgeryCase) {
    return (
      <div className="py-24 text-center">
        <p className="mb-4 text-muted-foreground">Case not found.</p>
        <Button asChild variant="outline">
          <Link href="/theatre/cases">Back to cases</Link>
        </Button>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${config.label} · ${surgeryCase.case_number}`}
        helpContent={config.helpContent}
      />

      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {surgeryCase.patient_name}
            <span className="text-muted-foreground"> · {surgeryCase.patient_mrn}</span>
          </p>
          <p className="truncate text-sm">{surgeryCase.primary_procedure_name}</p>
          <p className="text-xs text-muted-foreground">
            {surgeryCase.theatre_name} · {surgeryCase.scheduled_date} {surgeryCase.scheduled_start_time?.slice(0, 5)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TheatreCasePriorityBadge priority={surgeryCase.priority} hideElective />
          <TheatreCaseStatusBadge status={surgeryCase.status} />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" asChild>
          <Link href={`/theatre/cases/${surgeryCase.case_number}`}>
            <Stethoscope className="mr-2 h-4 w-4" />
            Overview
          </Link>
        </Button>
        <Button variant={workspace === 'pre-op' ? 'default' : 'outline'} asChild>
          <Link href={`/theatre/cases/${surgeryCase.case_number}/pre-op`}>Pre-Op</Link>
        </Button>
        <Button variant={workspace === 'intra-op' ? 'default' : 'outline'} asChild>
          <Link href={`/theatre/cases/${surgeryCase.case_number}/intra-op`}>Intra-Op</Link>
        </Button>
        <Button variant={workspace === 'post-op' ? 'default' : 'outline'} asChild>
          <Link href={`/theatre/cases/${surgeryCase.case_number}/post-op`}>Post-Op</Link>
        </Button>
      </div>

      {!statusAligned ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{config.label} opened outside its usual workflow stage</AlertTitle>
          <AlertDescription>
            This case is currently in {surgeryCase.status.replace(/_/g, ' ')}. You can still review or complete documentation here.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{config.label}</span>
      </div>

      {renderWorkspace(workspace, surgeryCase, fetchCase)}
    </div>
  );
}
