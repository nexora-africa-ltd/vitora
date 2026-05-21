/**
 * AI Insights Page
 *
 * Aggregated view of AI usage: stored results, suggestion acceptance rates,
 * chat metrics, feedback stats, and usage breakdown.
 */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  BrainCircuit,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Activity,
  CheckCircle2,
  BarChart3,
  AlertCircle,
  Sparkles,
  Link2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAIInsights } from '@/lib/hooks/use-ai';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { TokenUsageCard } from '@/components/admin/token-usage-card';
import { useFacility } from '@/lib/context/facility-context';

// Human-readable action labels
const ACTION_LABELS: Record<string, string> = {
  ai_clinical_chat: 'Clinical Chat',
  ai_clinical_assist: 'Clinical Assist',
  ai_icd10_suggest: 'ICD-10 Suggest',
  ai_care_plan_generate: 'Care Plan',
  ai_lab_interpret: 'Lab Interpret',
  ai_discharge_assess: 'Discharge Assess',
  ai_cds_evaluate: 'CDS Evaluate',
  ai_autopopulate_request: 'Autopopulate',
  ai_condition_predict: 'Condition Predict',
  ai_icu_predict: 'ICU Predict',
  ai_investigation_suggest: 'Investigation Suggest',
  ai_surgical_pre_op_assess: 'Surgical Pre-Op',
  ai_surgical_checklist_start: 'Surgical Checklist',
  ai_surgical_post_op_care_plan: 'Post-Op Care Plan',
  ai_suggestion_accepted: 'Suggestion Accepted',
  ai_suggestion_applied: 'Suggestion Applied',
  ai_feedback_submit: 'Feedback',
  ai_clerking_autocomplete: 'Clerking Autocomplete',
  ai_clerking_structure: 'Clerking Structure',
  ai_clinical_document_generate: 'Clinical Document',
};

function formatActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/^ai_/, '').replace(/_/g, ' ');
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  variant = 'default',
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colorMap = {
    default: 'text-primary',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-destructive',
  };

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <Icon className={`h-8 w-8 ${colorMap[variant]} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIInsightsPage() {
  const { data: insights, isLoading, error } = useAIInsights();
  const { refresh, isRefreshing } = usePageRefresh();
  const { organization } = useFacility();

  const acceptanceRate = useMemo(() => {
    if (!insights?.suggestion_audit.total) return null;
    const { accepted, applied, total } = insights.suggestion_audit;
    return Math.round(((accepted + applied) / total) * 100);
  }, [insights]);

  const advisoryOrderRate = useMemo(() => {
    if (!insights?.advisory_links.total) return null;
    return Math.round(
      (insights.advisory_links.ordered / insights.advisory_links.total) * 100
    );
  }, [insights]);

  if (error) {
    // 404 = TIBABOT_ENABLED is false on the backend
    const statusCode = (error as any)?.response?.status || (error as any)?.status;
    const isNotEnabled = statusCode === 404 || error.message?.includes('404');
    return (
      <div className="space-y-4">
        <PageHeader
          title="AI Insights"
          helpContent="View aggregated AI usage statistics, acceptance rates, and feedback."
        />
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className={`h-10 w-10 ${isNotEnabled ? 'text-muted-foreground' : 'text-destructive'}`} />
            <p className="text-sm text-muted-foreground">
              {isNotEnabled
                ? 'AI features are not enabled for this environment.'
                : 'Failed to load AI insights. Please try again later.'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="AI Insights"
          helpContent="View aggregated AI usage statistics, stored results, suggestion acceptance rates, and feedback metrics. Data covers the last 30 days."
        />

        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-lg" />
            ))}
          </div>
        ) : insights ? (
          <>
            {/* Top-level KPIs */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total AI Actions (30d)"
                value={insights.total_ai_actions_30d.toLocaleString()}
                icon={Activity}
              />
              <StatCard
                title="Stored Results"
                value={insights.stored_results.total.toLocaleString()}
                icon={BrainCircuit}
              />
              <StatCard
                title="Chat Sessions"
                value={insights.chat_metrics.total_sessions.toLocaleString()}
                icon={MessageSquare}
                description={`${insights.chat_metrics.recent_sessions} this week`}
              />
              <StatCard
                title="Suggestion Acceptance"
                value={acceptanceRate !== null ? `${acceptanceRate}%` : '—'}
                icon={CheckCircle2}
                variant={
                  acceptanceRate !== null && acceptanceRate >= 70
                    ? 'success'
                    : acceptanceRate !== null && acceptanceRate >= 40
                      ? 'warning'
                      : 'default'
                }
                description={`${insights.suggestion_audit.total} total`}
              />
            </div>

            {/* Feedback + Advisory */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Positive Feedback"
                value={insights.feedback.total_up}
                icon={ThumbsUp}
                variant="success"
              />
              <StatCard
                title="Negative Feedback"
                value={insights.feedback.total_down}
                icon={ThumbsDown}
                variant={insights.feedback.total_down > 10 ? 'danger' : 'default'}
              />
              <StatCard
                title="Advisory Links"
                value={insights.advisory_links.total}
                icon={Link2}
                description={
                  advisoryOrderRate !== null
                    ? `${advisoryOrderRate}% ordered`
                    : undefined
                }
              />
              <StatCard
                title="Chat Messages"
                value={insights.chat_metrics.total_messages.toLocaleString()}
                icon={Sparkles}
              />
            </div>

            {/* Token Usage Meter */}
            {organization && (
              <TokenUsageCard organizationId={organization.id} />
            )}

            {/* Stored Results Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4" />
                  Stored Results Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Care Plans', value: insights.stored_results.care_plans, href: '/encounters' },
                    { label: 'CDS Evaluations', value: insights.stored_results.cds_evaluations, href: '/cds/alerts' },
                    { label: 'Lab Interpretations', value: insights.stored_results.lab_interpretations, href: '/laboratory' },
                    { label: 'Discharge Assessments', value: insights.stored_results.discharge_assessments, href: '/inpatient/admissions' },
                    { label: 'ICU Risk Predictions', value: insights.stored_results.icu_risk_predictions, href: '/inpatient/admissions' },
                    { label: 'Investigation Suggestions', value: insights.stored_results.investigation_suggestions, href: '/encounters' },
                    { label: 'Surgical Pre-Op', value: insights.stored_results.surgical_pre_op, href: '/theatre' },
                    { label: 'Surgical Checklists', value: insights.stored_results.surgical_checklists, href: '/theatre' },
                    { label: 'Surgical Post-Op', value: insights.stored_results.surgical_post_op, href: '/theatre' },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <Badge variant="secondary">{item.value}</Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Usage Breakdown */}
            {insights.usage_breakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Top AI Actions (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {insights.usage_breakdown.map((item) => {
                      const maxCount = insights.usage_breakdown[0]?.count || 1;
                      const percentage = Math.round((item.count / maxCount) * 100);
                      return (
                        <div key={item.action} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate">{formatActionLabel(item.action)}</span>
                            <span className="text-muted-foreground font-mono ml-2">
                              {item.count}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Suggestion Audit Detail */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Suggestion Audit (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-lg font-semibold">
                        {insights.suggestion_audit.accepted}
                      </p>
                      <p className="text-xs text-muted-foreground">Accepted</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-lg font-semibold">
                        {insights.suggestion_audit.applied}
                      </p>
                      <p className="text-xs text-muted-foreground">Applied</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold">
                        {insights.suggestion_audit.acknowledged}
                      </p>
                      <p className="text-xs text-muted-foreground">Acknowledged</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </PullToRefresh>
  );
}
