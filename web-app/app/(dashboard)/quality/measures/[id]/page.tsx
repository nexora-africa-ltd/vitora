'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { qualityApi } from '@/lib/api/quality';
import { useClinics } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { Code2, Target, BarChart3, Link2, Activity, AlertTriangle } from 'lucide-react';
import type {
  QualityEvaluationRule,
  QualityEvaluationRuleType,
  QualityMeasureDomain,
  QualityMeasureStatus,
  QualityRulePreviewResponse,
} from '@/lib/types/quality';

type RuleDraft = {
  rule: QualityEvaluationRule;
  assumptions: string[];
  warnings: string[];
  confidence: number;
};

type RulePreviewForm = {
  clinic_id: string;
  year: string;
  period: string;
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
};

function generateDraftFromNarrative(
  numeratorLogic: string,
  denominatorLogic: string,
  exclusionLogic: string
): RuleDraft | null {
  const text = `${numeratorLogic} ${denominatorLogic} ${exclusionLogic}`.toLowerCase();
  const waitTimeMatch = text.match(/(\d+)\s*(minute|minutes|min|mins)/i);
  const inferredMaxMinutes = waitTimeMatch ? Number(waitTimeMatch[1]) : 30;

  if (!text.trim()) return null;

  if (text.includes('bp') || text.includes('blood pressure') || text.includes('140/90')) {
    return {
      rule: {
        type: 'bp_control',
        params: {
          systolic_max: 140,
          diastolic_max: 90,
        },
      },
      assumptions: [
        'Blood pressure control inferred from narrative terms (BP, blood pressure, 140/90).',
      ],
      warnings: [],
      confidence: 0.84,
    };
  }

  if (
    text.includes('hba1c') ||
    text.includes('viral load') ||
    text.includes('threshold') ||
    text.includes('<') ||
    text.includes('>')
  ) {
    const isHba1c = text.includes('hba1c');
    const isViralLoad = text.includes('viral load') || text.includes('vl');
    const threshold = isHba1c ? 7 : isViralLoad ? 1000 : 0;
    return {
      rule: {
        type: 'lab_threshold',
        params: {
          test_name: isHba1c ? 'HbA1c' : isViralLoad ? 'Viral Load' : '',
          threshold,
          comparison: text.includes('>=') || text.includes('greater') ? 'gte' : 'lt',
        },
      },
      assumptions: ['Lab threshold rule inferred from narrative threshold language.'],
      warnings:
        threshold === 0
          ? ['Threshold value could not be confidently inferred. Review and edit before applying.']
          : [],
      confidence: threshold === 0 ? 0.62 : 0.82,
    };
  }

  if (text.includes('wait') || text.includes('minutes') || text.includes('seen within')) {
    const isTriageWait = text.includes('triage');
    return {
      rule: {
        type: 'wait_time',
        params: {
          max_minutes: inferredMaxMinutes,
          data_source: isTriageWait ? 'triage_assessment' : 'clinic_visit',
        },
      },
      assumptions: [
        'Wait-time rule inferred from queue/waiting-time language.',
        isTriageWait
          ? 'Data source inferred as triage_assessment because narrative mentions triage.'
          : 'Data source defaulted to clinic_visit.',
      ],
      warnings: waitTimeMatch ? [] : ['Max minutes defaulted to 30. Confirm clinical target.'],
      confidence: waitTimeMatch ? 0.9 : 0.72,
    };
  }

  if (text.includes('visit') || text.includes('anc') || text.includes('4+')) {
    return {
      rule: {
        type: 'visit_count',
        params: {
          min_visits: text.includes('4+') || text.includes('>= 4') ? 4 : 1,
          enrollment_status: 'ACTIVE',
        },
      },
      assumptions: ['Visit count rule inferred from terms such as ANC, visit count, or 4+ visits.'],
      warnings: [],
      confidence: 0.78,
    };
  }

  if (text.includes('stock') || text.includes('stock-out') || text.includes('availability')) {
    return {
      rule: {
        type: 'stock_availability',
        params: {
          tracer_only: true,
          stock_out_threshold: 0,
        },
      },
      assumptions: ['Stock availability rule inferred from stock-out/availability language.'],
      warnings: [],
      confidence: 0.74,
    };
  }

  if (
    text.includes('defaulter') ||
    text.includes('active enrollment') ||
    text.includes('enrollment')
  ) {
    return {
      rule: {
        type: 'enrollment_active',
        params: {
          target_status: 'ACTIVE',
        },
      },
      assumptions: ['Enrollment-active rule inferred from enrollment/defaulter language.'],
      warnings: [],
      confidence: 0.7,
    };
  }

  return null;
}

const STATUS_COLORS: Record<QualityMeasureStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  RETIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const DOMAIN_COLORS: Record<QualityMeasureDomain, string> = {
  CLINICAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PATIENT_SAFETY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  EFFICIENCY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  PATIENT_EXPERIENCE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  PUBLIC_HEALTH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CARE_COORDINATION: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="break-words text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

export default function QualityMeasureDetailPage() {
  const params = useParams();
  const measureId = Number(params?.id);
  const queryClient = useQueryClient();

  const {
    data: measure,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['quality-measure', measureId],
    queryFn: () => qualityApi.getMeasure(measureId),
    enabled: Number.isFinite(measureId),
  });

  const [draftRule, setDraftRule] = useState<RuleDraft | null>(null);
  const [manualRuleType, setManualRuleType] = useState<QualityEvaluationRuleType | ''>('');
  const [manualParams, setManualParams] = useState({
    systolic_max: '140',
    diastolic_max: '90',
    test_name: '',
    test_code: '',
    threshold: '',
    comparison: 'lt',
    max_minutes: '30',
    wait_data_source: 'clinic_visit',
    min_visits: '4',
    enrollment_status: 'ACTIVE',
    target_status: 'ACTIVE',
    tracer_only: 'true',
    stock_out_threshold: '0',
    ratio_multiplier: '100000',
    vaccine_program: 'KEPI',
    max_patient_age_years: '5',
    strict_due_in_period: 'true',
    deadline_days_after_week_end: '1',
    include_approved: 'false',
    require_dhis2_timestamp: 'true',
  });
  const [previewConfig, setPreviewConfig] = useState<RulePreviewForm>({
    clinic_id: '',
    year: String(new Date().getFullYear()),
    period: '1',
    period_type: 'QUARTERLY',
  });
  const [previewResult, setPreviewResult] = useState<QualityRulePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: clinicsData } = useClinics({ page_size: 200, status: 'ACTIVE' });
  const availableClinics = useMemo(() => clinicsData?.results ?? [], [clinicsData?.results]);

  const { mutateAsync: saveMeasureRule, isPending: isSavingRule } = useMutation({
    mutationFn: (payload: { evaluation_rule: QualityEvaluationRule | null }) =>
      qualityApi.updateMeasure(measureId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-measure', measureId] });
      queryClient.invalidateQueries({ queryKey: ['quality-measures'] });
      toast({ title: 'Rule updated', description: 'Evaluation rule saved for this measure.' });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Failed to save rule',
        description:
          err instanceof Error ? err.message : 'Please review rule settings and try again.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: previewRule, isPending: isPreviewPending } = useMutation({
    mutationFn: qualityApi.previewRule,
  });

  useEffect(() => {
    if (!measure) return;

    setPreviewConfig((prev) => ({ ...prev, period_type: measure.reporting_period }));

    const rule = measure.evaluation_rule;
    if (!rule) {
      setManualRuleType('');
      return;
    }

    setManualRuleType(rule.type);
    const params = rule.params as Record<string, unknown>;
    if (rule.type === 'bp_control') {
      setManualParams((prev) => ({
        ...prev,
        systolic_max: String(params.systolic_max ?? 140),
        diastolic_max: String(params.diastolic_max ?? 90),
      }));
    }
    if (rule.type === 'lab_threshold') {
      setManualParams((prev) => ({
        ...prev,
        test_name: String(params.test_name ?? ''),
        test_code: String(params.test_code ?? ''),
        threshold: String(params.threshold ?? ''),
        comparison: String(params.comparison ?? 'lt'),
      }));
    }
    if (rule.type === 'wait_time') {
      setManualParams((prev) => ({
        ...prev,
        max_minutes: String(params.max_minutes ?? 30),
        wait_data_source: String(params.data_source ?? 'clinic_visit'),
      }));
    }
    if (rule.type === 'visit_count') {
      setManualParams((prev) => ({
        ...prev,
        min_visits: String(params.min_visits ?? 4),
        enrollment_status: String(params.enrollment_status ?? 'ACTIVE'),
      }));
    }
    if (rule.type === 'enrollment_active') {
      setManualParams((prev) => ({
        ...prev,
        target_status: String(params.target_status ?? 'ACTIVE'),
      }));
    }
    if (rule.type === 'stock_availability') {
      setManualParams((prev) => ({
        ...prev,
        tracer_only: String(params.tracer_only ?? true),
        stock_out_threshold: String(params.stock_out_threshold ?? 0),
      }));
    }
    if (rule.type === 'immunization_completeness') {
      setManualParams((prev) => ({
        ...prev,
        vaccine_program: String(params.vaccine_program ?? 'KEPI'),
        max_patient_age_years: String(params.max_patient_age_years ?? 5),
        strict_due_in_period: String(params.strict_due_in_period ?? true),
      }));
    }
    if (rule.type === 'maternal_mortality_ratio') {
      setManualParams((prev) => ({
        ...prev,
        ratio_multiplier: String(params.ratio_multiplier ?? 100000),
      }));
    }
    if (rule.type === 'idsr_timeliness') {
      setManualParams((prev) => ({
        ...prev,
        deadline_days_after_week_end: String(params.deadline_days_after_week_end ?? 1),
        include_approved: String(params.include_approved ?? false),
        require_dhis2_timestamp: String(params.require_dhis2_timestamp ?? true),
      }));
    }
  }, [measure]);

  const buildManualRule = (): QualityEvaluationRule | null => {
    if (!manualRuleType) return null;
    switch (manualRuleType) {
      case 'bp_control':
        return {
          type: 'bp_control',
          params: {
            systolic_max: Number(manualParams.systolic_max) || 140,
            diastolic_max: Number(manualParams.diastolic_max) || 90,
          },
        };
      case 'lab_threshold':
        return {
          type: 'lab_threshold',
          params: {
            test_name: manualParams.test_name,
            test_code: manualParams.test_code,
            threshold: Number(manualParams.threshold) || 0,
            comparison: manualParams.comparison,
            clinic_types: measure?.applicable_clinic_types ?? [],
          },
        };
      case 'wait_time':
        return {
          type: 'wait_time',
          params: {
            max_minutes: Number(manualParams.max_minutes) || 30,
            data_source: manualParams.wait_data_source || 'clinic_visit',
          },
        };
      case 'visit_count':
        return {
          type: 'visit_count',
          params: {
            min_visits: Number(manualParams.min_visits) || 4,
            enrollment_status: manualParams.enrollment_status || 'ACTIVE',
          },
        };
      case 'enrollment_active':
        return {
          type: 'enrollment_active',
          params: {
            target_status: manualParams.target_status || 'ACTIVE',
            missed_threshold_days: 30,
          },
        };
      case 'stock_availability':
        return {
          type: 'stock_availability',
          params: {
            tracer_only: manualParams.tracer_only === 'true',
            stock_out_threshold: Number(manualParams.stock_out_threshold) || 0,
          },
        };
      case 'skilled_birth_attendance':
        return {
          type: 'skilled_birth_attendance',
          params: {
            require_documented_attendant: true,
            delivery_status: 'COMPLETED',
            include_outcomes: ['LIVE_BIRTH', 'STILLBIRTH', 'NEONATAL_DEATH'],
          },
        };
      case 'tb_treatment_success':
        return {
          type: 'tb_treatment_success',
          params: {
            success_statuses: ['COMPLETED'],
            success_keywords: ['cured', 'treatment complete', 'completed'],
            use_outcome_reason: true,
            require_outcome_date: true,
            cohort_statuses: [
              'COMPLETED',
              'TRANSFERRED_OUT',
              'LOST_TO_FOLLOW_UP',
              'DECEASED',
              'SUSPENDED',
            ],
          },
        };
      case 'immunization_completeness':
        return {
          type: 'immunization_completeness',
          params: {
            vaccine_program: manualParams.vaccine_program || 'KEPI',
            max_patient_age_years: Number(manualParams.max_patient_age_years) || 5,
            strict_due_in_period: manualParams.strict_due_in_period === 'true',
          },
        };
      case 'maternal_mortality_ratio':
        return {
          type: 'maternal_mortality_ratio',
          params: {
            ratio_multiplier: Number(manualParams.ratio_multiplier) || 100000,
            delivery_status: 'COMPLETED',
          },
        };
      case 'idsr_timeliness':
        return {
          type: 'idsr_timeliness',
          params: {
            submission_statuses: ['SUBMITTED'],
            include_approved: manualParams.include_approved === 'true',
            deadline_days_after_week_end: Number(manualParams.deadline_days_after_week_end) || 1,
            require_dhis2_timestamp: manualParams.require_dhis2_timestamp === 'true',
          },
        };
      default:
        return null;
    }
  };

  const currentRule = measure?.evaluation_rule ?? null;

  const validationSummary = useMemo(() => {
    const rule = currentRule;
    if (!rule) {
      return {
        valid: true,
        errors: [] as string[],
        warnings: [
          'No automated evaluation rule is applied. This measure will not auto-calculate.',
        ],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (rule.type === 'lab_threshold') {
      const threshold = Number((rule.params as Record<string, unknown>).threshold ?? 0);
      const testName = String((rule.params as Record<string, unknown>).test_name ?? '');
      const testCode = String((rule.params as Record<string, unknown>).test_code ?? '');
      if (!testName && !testCode)
        errors.push('Lab threshold rule requires test_name or test_code.');
      if (!Number.isFinite(threshold) || threshold === 0)
        errors.push('Lab threshold rule requires a non-zero threshold value.');
      if (testName && !testCode)
        warnings.push('Consider adding test_code (LOINC) for precise mapping.');
    }

    if (rule.type === 'wait_time') {
      const maxMinutes = Number((rule.params as Record<string, unknown>).max_minutes ?? 0);
      if (!Number.isFinite(maxMinutes) || maxMinutes <= 0)
        errors.push('Wait time rule requires max_minutes greater than 0.');
    }

    if (rule.type === 'visit_count') {
      const minVisits = Number((rule.params as Record<string, unknown>).min_visits ?? 0);
      if (!Number.isFinite(minVisits) || minVisits <= 0)
        errors.push('Visit count rule requires min_visits greater than 0.');
    }

    return { valid: errors.length === 0, errors, warnings };
  }, [currentRule]);

  const handleGenerateDraft = () => {
    if (!measure) return;
    const draft = generateDraftFromNarrative(
      measure.numerator_logic,
      measure.denominator_logic,
      measure.exclusion_logic || ''
    );
    if (!draft) {
      toast({
        title: 'No draft generated',
        description: 'Could not infer a safe structured rule from measure logic.',
        variant: 'destructive',
      });
      return;
    }
    setDraftRule(draft);
    toast({ title: 'Draft generated', description: 'Review assumptions before applying.' });
  };

  const handleApplyDraft = async () => {
    if (!draftRule) return;
    await saveMeasureRule({ evaluation_rule: draftRule.rule });
    setManualRuleType(draftRule.rule.type);
  };

  const handleApplyManualRule = async () => {
    const rule = buildManualRule();
    await saveMeasureRule({ evaluation_rule: rule });
  };

  const handlePreviewRule = async () => {
    setPreviewError(null);
    setPreviewResult(null);

    if (!currentRule) {
      setPreviewError('Apply/save an evaluation rule before testing.');
      return;
    }

    const clinicId = Number(previewConfig.clinic_id);
    const year = Number(previewConfig.year);
    const period = Number(previewConfig.period);

    if (!Number.isFinite(clinicId) || clinicId <= 0) {
      setPreviewError('Select a clinic for test run.');
      return;
    }

    try {
      const result = await previewRule({
        evaluation_rule: currentRule,
        clinic_id: clinicId,
        year,
        period,
        period_type: previewConfig.period_type,
      });
      setPreviewResult(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to run rule preview.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quality Measure" />
        <Skeleton className="h-20" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !measure) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quality Measure" />
        <Card className="p-6">
          <p className="text-destructive">Failed to load quality measure. It may not exist.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={measure.name}
        helpContent="View quality measure definition including numerator/denominator logic, target thresholds, and DHIS2 mapping."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-sm text-muted-foreground">{measure.code}</p>
          <p className="text-sm text-muted-foreground">
            {measure.reporting_period_display} reporting
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={`${DOMAIN_COLORS[measure.domain]} w-fit`} variant="secondary">
            {measure.domain_display}
          </Badge>
          <Badge className={`${STATUS_COLORS[measure.status]} w-fit`} variant="secondary">
            {measure.status_display}
          </Badge>
        </div>
      </div>

      {/* Description */}
      {measure.description && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm leading-relaxed">{measure.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Detail Cards */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Measure Logic */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Measure Logic</CardTitle>
              <HelpPopover content="The numerator defines patients meeting the measure criteria. The denominator defines the eligible population." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Numerator
              </p>
              <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-sm">
                {measure.numerator_logic || '—'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Denominator
              </p>
              <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-sm">
                {measure.denominator_logic || '—'}
              </p>
            </div>
            {measure.exclusion_logic && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Exclusions
                </p>
                <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-sm">
                  {measure.exclusion_logic}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thresholds & Configuration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Thresholds & Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow
              icon={Target}
              label="Target Percentage"
              value={measure.target_percentage ? `${measure.target_percentage}%` : 'Not set'}
            />
            <InfoRow
              icon={AlertTriangle}
              label="Low Threshold"
              value={measure.low_threshold ? `${measure.low_threshold}%` : 'Not set'}
            />
            <InfoRow
              icon={BarChart3}
              label="Reporting Period"
              value={measure.reporting_period_display}
            />
            <InfoRow
              icon={Code2}
              label="DHIS2 Indicator ID"
              value={measure.dhis2_indicator_id || 'Not mapped'}
            />
            {measure.reference_url && (
              <InfoRow
                icon={Link2}
                label="Reference"
                value={
                  <a
                    href={measure.reference_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary hover:underline"
                  >
                    {measure.reference_url}
                  </a>
                }
              />
            )}
            {measure.applicable_clinic_types.length > 0 && (
              <InfoRow
                icon={Activity}
                label="Applicable Clinic Types"
                value={
                  <div className="mt-1 flex flex-wrap gap-1">
                    {measure.applicable_clinic_types.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Automated Evaluation Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Update structured evaluation logic without recreating this measure.
            </p>
            <Button type="button" variant="outline" onClick={handleGenerateDraft}>
              Generate Draft from Measure Logic
            </Button>
          </div>

          {draftRule ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">Draft Rule (Review Required)</p>
              <p>
                <span className="text-muted-foreground">Type:</span> {draftRule.rule.type}
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(draftRule.rule.params, null, 2)}
              </pre>
              <p>
                <span className="text-muted-foreground">Confidence:</span>{' '}
                {Math.round(draftRule.confidence * 100)}%
              </p>
              {draftRule.assumptions.length > 0 ? (
                <ul className="list-disc pl-5">
                  {draftRule.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {draftRule.warnings.length > 0 ? (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {draftRule.warnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleApplyDraft} disabled={isSavingRule}>
                  Apply Draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraftRule(null)}
                >
                  Discard Draft
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select
                value={manualRuleType || '__NONE__'}
                onValueChange={(v) =>
                  setManualRuleType(v === '__NONE__' ? '' : (v as QualityEvaluationRuleType))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No automated rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">No automated rule</SelectItem>
                  <SelectItem value="visit_count">Visit Count</SelectItem>
                  <SelectItem value="lab_threshold">Lab Threshold</SelectItem>
                  <SelectItem value="bp_control">BP Control</SelectItem>
                  <SelectItem value="wait_time">Wait Time</SelectItem>
                  <SelectItem value="enrollment_active">Enrollment Active</SelectItem>
                  <SelectItem value="stock_availability">Stock Availability</SelectItem>
                  <SelectItem value="skilled_birth_attendance">Skilled Birth Attendance</SelectItem>
                  <SelectItem value="tb_treatment_success">TB Treatment Success</SelectItem>
                  <SelectItem value="immunization_completeness">
                    Immunization Completeness
                  </SelectItem>
                  <SelectItem value="maternal_mortality_ratio">Maternal Mortality Ratio</SelectItem>
                  <SelectItem value="idsr_timeliness">IDSR Timeliness</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {manualRuleType === 'visit_count' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Visits</Label>
                <Input
                  type="number"
                  min="1"
                  value={manualParams.min_visits}
                  onChange={(e) => setManualParams((p) => ({ ...p, min_visits: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Enrollment Status</Label>
                <Select
                  value={manualParams.enrollment_status}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, enrollment_status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="ANY">ANY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {manualRuleType === 'lab_threshold' ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Test Name</Label>
                <Input
                  value={manualParams.test_name}
                  onChange={(e) => setManualParams((p) => ({ ...p, test_name: e.target.value }))}
                  placeholder="HbA1c"
                />
              </div>
              <div className="space-y-2">
                <Label>Test Code (LOINC)</Label>
                <Input
                  value={manualParams.test_code}
                  onChange={(e) => setManualParams((p) => ({ ...p, test_code: e.target.value }))}
                  placeholder="4548-4"
                />
              </div>
              <div className="space-y-2">
                <Label>Threshold</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualParams.threshold}
                  onChange={(e) => setManualParams((p) => ({ ...p, threshold: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Comparison</Label>
                <Select
                  value={manualParams.comparison}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, comparison: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lt">&lt;</SelectItem>
                    <SelectItem value="lte">&lt;=</SelectItem>
                    <SelectItem value="gt">&gt;</SelectItem>
                    <SelectItem value="gte">&gt;=</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {manualRuleType === 'bp_control' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Systolic Max</Label>
                <Input
                  type="number"
                  value={manualParams.systolic_max}
                  onChange={(e) => setManualParams((p) => ({ ...p, systolic_max: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Diastolic Max</Label>
                <Input
                  type="number"
                  value={manualParams.diastolic_max}
                  onChange={(e) =>
                    setManualParams((p) => ({ ...p, diastolic_max: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : null}

          {manualRuleType === 'wait_time' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Max Minutes</Label>
                <Input
                  type="number"
                  min="1"
                  value={manualParams.max_minutes}
                  onChange={(e) => setManualParams((p) => ({ ...p, max_minutes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Source</Label>
                <Select
                  value={manualParams.wait_data_source}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, wait_data_source: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinic_visit">Clinic Visit</SelectItem>
                    <SelectItem value="triage_assessment">Triage Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {manualRuleType === 'enrollment_active' ? (
            <div className="max-w-xs space-y-2">
              <Label>Target Status</Label>
              <Select
                value={manualParams.target_status}
                onValueChange={(v) => setManualParams((p) => ({ ...p, target_status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="DEFAULTED">DEFAULTED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {manualRuleType === 'stock_availability' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tracer Only</Label>
                <Select
                  value={manualParams.tracer_only}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, tracer_only: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stock-out Threshold</Label>
                <Input
                  type="number"
                  value={manualParams.stock_out_threshold}
                  onChange={(e) =>
                    setManualParams((p) => ({ ...p, stock_out_threshold: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : null}

          {manualRuleType === 'immunization_completeness' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Vaccine Program</Label>
                <Input
                  value={manualParams.vaccine_program}
                  onChange={(e) =>
                    setManualParams((p) => ({ ...p, vaccine_program: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Patient Age (Years)</Label>
                <Input
                  type="number"
                  min="1"
                  value={manualParams.max_patient_age_years}
                  onChange={(e) =>
                    setManualParams((p) => ({ ...p, max_patient_age_years: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Strict Due In Period</Label>
                <Select
                  value={manualParams.strict_due_in_period}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, strict_due_in_period: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {manualRuleType === 'maternal_mortality_ratio' ? (
            <div className="max-w-xs space-y-2">
              <Label>Ratio Multiplier</Label>
              <Input
                type="number"
                min="1"
                value={manualParams.ratio_multiplier}
                onChange={(e) =>
                  setManualParams((p) => ({ ...p, ratio_multiplier: e.target.value }))
                }
              />
            </div>
          ) : null}

          {manualRuleType === 'idsr_timeliness' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Deadline Days After Week End</Label>
                <Input
                  type="number"
                  min="0"
                  value={manualParams.deadline_days_after_week_end}
                  onChange={(e) =>
                    setManualParams((p) => ({ ...p, deadline_days_after_week_end: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Include Approved</Label>
                <Select
                  value={manualParams.include_approved}
                  onValueChange={(v) => setManualParams((p) => ({ ...p, include_approved: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Require DHIS2 Timestamp</Label>
                <Select
                  value={manualParams.require_dhis2_timestamp}
                  onValueChange={(v) =>
                    setManualParams((p) => ({ ...p, require_dhis2_timestamp: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {manualRuleType === 'skilled_birth_attendance' ? (
            <p className="text-sm text-muted-foreground">
              Uses completed facility deliveries with documented attendant by default.
            </p>
          ) : null}

          {manualRuleType === 'tb_treatment_success' ? (
            <p className="text-sm text-muted-foreground">
              Uses TB enrollment outcomes in-period with success status/keywords defaults.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleApplyManualRule} disabled={isSavingRule}>
              {isSavingRule ? 'Saving...' : 'Save Rule'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveMeasureRule({ evaluation_rule: null })}
              disabled={isSavingRule}
            >
              Clear Saved Rule
            </Button>
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-1 text-sm font-medium">Saved Rule JSON</p>
            {currentRule ? (
              <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(currentRule, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No structured evaluation rule saved.</p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Rule Validation</p>
            {validationSummary.errors.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-destructive">
                {validationSummary.errors.map((errorItem) => (
                  <li key={errorItem}>{errorItem}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">Rule structure is valid for save/test.</p>
            )}
            {validationSummary.warnings.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {validationSummary.warnings.map((warningItem) => (
                  <li key={warningItem}>{warningItem}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Test Rule (Dry Run)</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Clinic</Label>
                <Select
                  value={previewConfig.clinic_id}
                  onValueChange={(v) => setPreviewConfig((p) => ({ ...p, clinic_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClinics.map((clinic) => (
                      <SelectItem key={clinic.id} value={String(clinic.id)}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={previewConfig.year}
                  onChange={(e) => setPreviewConfig((p) => ({ ...p, year: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Period Type</Label>
                <Select
                  value={previewConfig.period_type}
                  onValueChange={(v) =>
                    setPreviewConfig((p) => ({
                      ...p,
                      period_type: v as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">MONTHLY</SelectItem>
                    <SelectItem value="QUARTERLY">QUARTERLY</SelectItem>
                    <SelectItem value="ANNUAL">ANNUAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-w-xs space-y-2">
              <Label>Period</Label>
              <Input
                type="number"
                value={previewConfig.period}
                onChange={(e) => setPreviewConfig((p) => ({ ...p, period: e.target.value }))}
              />
            </div>
            <Button
              type="button"
              onClick={handlePreviewRule}
              disabled={isPreviewPending || !validationSummary.valid || !currentRule}
            >
              {isPreviewPending ? 'Testing...' : 'Run Test Rule'}
            </Button>
            {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}
            {previewResult ? (
              <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Numerator:</span>{' '}
                  {previewResult.numerator}
                </p>
                <p>
                  <span className="text-muted-foreground">Denominator:</span>{' '}
                  {previewResult.denominator}
                </p>
                <p>
                  <span className="text-muted-foreground">Percentage:</span>{' '}
                  {previewResult.percentage}%
                </p>
                <p>
                  <span className="text-muted-foreground">Notes:</span>{' '}
                  {previewResult.notes || 'N/A'}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardContent className="flex flex-col gap-1 p-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>Created: {formatDateTime(measure.created_at)}</span>
          <span>Updated: {formatDateTime(measure.updated_at)}</span>
        </CardContent>
      </Card>
    </div>
  );
}
