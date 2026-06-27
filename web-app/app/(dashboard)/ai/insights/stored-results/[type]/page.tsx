'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { BrainCircuit, Clock, User, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { aiApi } from '@/lib/api/ai';
import { formatDateTime } from '@/lib/utils/format';
import type { StoredAIResultBase } from '@/lib/types/ai';

/**
 * Configuration for each stored result type:
 * - label: display name
 * - fetchFn: API call
 * - columns: extra fields to show
 * - getLink: optional link to context (encounter/admission)
 */
const RESULT_TYPE_CONFIG: Record<string, {
  label: string;
  fetchFn: () => Promise<StoredAIResultBase[]>;
  renderRow: (item: Record<string, unknown>) => React.ReactNode;
}> = {
  'care-plans': {
    label: 'Care Plans',
    fetchFn: () => aiApi.getStoredCarePlans(),
    renderRow: (item) => (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{(item as { primary_diagnosis?: string }).primary_diagnosis || 'N/A'}</span>
        <span className="text-xs text-muted-foreground">
          {(item as { encounter_id?: number }).encounter_id ? `Encounter #${(item as { encounter_id?: number }).encounter_id}` : ''}
          {(item as { admission_id?: number }).admission_id ? `Admission #${(item as { admission_id?: number }).admission_id}` : ''}
        </span>
      </div>
    ),
  },
  'cds-evaluations': {
    label: 'CDS Evaluations',
    fetchFn: () => aiApi.getStoredCDSResults(),
    renderRow: (item) => (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{(item as { rules_fired?: number }).rules_fired ?? 0} rules fired</Badge>
        <Badge variant="outline">{(item as { alert_count?: number }).alert_count ?? 0} alerts</Badge>
      </div>
    ),
  },
  'lab-interpretations': {
    label: 'Lab Interpretations',
    fetchFn: () => aiApi.getStoredLabInterpretations(),
    renderRow: (item) => {
      const critical = (item as { critical_count?: number }).critical_count ?? 0;
      const abnormal = (item as { abnormal_count?: number }).abnormal_count ?? 0;
      return (
        <div className="flex items-center gap-2">
          {critical > 0 && <Badge variant="destructive">{critical} critical</Badge>}
          {abnormal > 0 && <Badge variant="warning">{abnormal} abnormal</Badge>}
          {critical === 0 && abnormal === 0 && <Badge variant="secondary">Normal</Badge>}
        </div>
      );
    },
  },
  'discharge-assessments': {
    label: 'Discharge Assessments',
    fetchFn: () => aiApi.getStoredDischargeResults(),
    renderRow: (item) => {
      const level = (item as { readiness_level?: string }).readiness_level ?? 'unknown';
      const score = (item as { readiness_score?: number | null }).readiness_score;
      const variant = level === 'READY' ? 'success' : level === 'NOT_READY' ? 'destructive' : 'warning';
      return (
        <div className="flex items-center gap-2">
          <Badge variant={variant as 'success' | 'destructive' | 'warning'}>{level}</Badge>
          {score != null && <span className="text-xs text-muted-foreground">Score: {score}%</span>}
        </div>
      );
    },
  },
  'icu-risk-predictions': {
    label: 'ICU Risk Predictions',
    fetchFn: () => aiApi.getStoredICURiskResults(),
    renderRow: (item) => {
      const risk = (item as { risk_level?: string }).risk_level ?? 'unknown';
      const score = (item as { risk_score?: number | null }).risk_score;
      const variant = risk === 'HIGH' || risk === 'CRITICAL' ? 'destructive' : risk === 'MEDIUM' ? 'warning' : 'secondary';
      return (
        <div className="flex items-center gap-2">
          <Badge variant={variant as 'destructive' | 'warning' | 'secondary'}>{risk}</Badge>
          {score != null && <span className="text-xs text-muted-foreground">Score: {score}</span>}
        </div>
      );
    },
  },
  'investigation-suggestions': {
    label: 'Investigation Suggestions',
    fetchFn: () => aiApi.getStoredInvestigationSuggestions(),
    renderRow: (item) => (
      <span className="text-xs text-muted-foreground">
        {(item as { encounter_id?: number }).encounter_id ? `Encounter #${(item as { encounter_id?: number }).encounter_id}` : 'No encounter'}
      </span>
    ),
  },
};

export default function StoredResultsListPage() {
  const { type } = useParams();
  const typeStr = type as string;
  const config = RESULT_TYPE_CONFIG[typeStr];

  if (!config) {
    notFound();
  }

  const { data: results, isLoading } = useQuery({
    queryKey: ['ai-stored-results', typeStr],
    queryFn: config.fetchFn,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={config.label}
        helpContent={`View stored AI ${config.label.toLowerCase()} generated by TibaBot. Shows the 20 most recent results for your facility.`}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="animate-pulse space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : !results || results.length === 0 ? (
        <Card className="p-6 text-center">
          <BrainCircuit className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No stored {config.label.toLowerCase()} yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Results appear here after TibaBot generates them during clinical encounters.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <Card key={result.id} className="p-3 sm:p-4 hover:bg-muted/30 transition-colors">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5 min-w-0">
                  {config.renderRow(result as unknown as Record<string, unknown>)}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(result.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {result.created_by}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{result.service_mode}</Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="text-center">
        <Link href="/ai/insights" className="text-sm text-muted-foreground hover:underline">
          ← Back to AI Insights
        </Link>
      </div>
    </div>
  );
}
