'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { qualityApi } from '@/lib/api/quality';
import { toast } from '@/lib/hooks/use-toast';
import { useClinics } from '@/lib/hooks/use-clinics';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type {
  QualityEvaluationRule,
  QualityEvaluationRuleType,
  QualityMeasureCreateData,
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
  exclusionLogic: string,
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

  if (text.includes('defaulter') || text.includes('active enrollment') || text.includes('enrollment')) {
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

export default function NewQualityMeasurePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canCreateMeasure = hasPermission('quality.add_qualitymeasure');

  if (!canCreateMeasure) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="New Quality Measure" />
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to create quality measures.
          </p>
        </Card>
      </div>
    );
  }

  const [formData, setFormData] = useState<QualityMeasureCreateData>({
    code: '',
    name: '',
    description: '',
    domain: 'CLINICAL',
    status: 'DRAFT',
    numerator_logic: '',
    denominator_logic: '',
    exclusion_logic: '',
    target_percentage: null,
    low_threshold: null,
    reporting_period: 'QUARTERLY',
    dhis2_indicator_id: '',
    reference_url: '',
    applicable_clinic_types: [],
    evaluation_rule: null,
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
  const availableClinicTypes = useMemo(() => {
    return Array.from(new Set(availableClinics.map((clinic) => clinic.clinic_type))).sort();
  }, [availableClinics]);

  const { mutateAsync: createMeasure, isPending } = useMutation({
    mutationFn: (data: QualityMeasureCreateData) =>
      qualityApi.createMeasure(data),
    onSuccess: (result) => {
      toast({ title: 'Quality measure created', description: result.name });
      queryClient.invalidateQueries({ queryKey: ['quality-measures'] });
      router.push(`/quality/measures/${result.id}`);
    },
    onError: () => {
      toast({
        title: 'Failed to create measure',
        description: 'Please check the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: previewRule, isPending: isPreviewPending } = useMutation({
    mutationFn: qualityApi.previewRule,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMeasure(formData);
  };

  const updateField = <K extends keyof QualityMeasureCreateData>(
    key: K,
    value: QualityMeasureCreateData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

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
            clinic_types: formData.applicable_clinic_types ?? [],
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

  const handleGenerateDraft = () => {
    const draft = generateDraftFromNarrative(
      formData.numerator_logic,
      formData.denominator_logic,
      formData.exclusion_logic || '',
    );
    if (!draft) {
      toast({
        title: 'No draft generated',
        description: 'Could not infer a safe structured rule from the current narrative logic.',
        variant: 'destructive',
      });
      return;
    }
    setDraftRule(draft);
    toast({ title: 'Draft generated', description: 'Review assumptions before applying.' });
  };

  const handleApplyDraft = () => {
    if (!draftRule) return;
    updateField('evaluation_rule', draftRule.rule);
    setManualRuleType(draftRule.rule.type);
    toast({ title: 'Draft applied', description: 'Structured evaluation rule has been added.' });
  };

  const handleApplyManualRule = () => {
    const rule = buildManualRule();
    updateField('evaluation_rule', rule);
    toast({
      title: rule ? 'Evaluation rule applied' : 'Evaluation rule cleared',
      description: rule
        ? 'This rule will be used only after measure activation and evaluation runs.'
        : 'No automated rule will be used for this measure.',
    });
  };

  const toggleApplicableClinicType = (clinicType: string) => {
    const current = formData.applicable_clinic_types ?? [];
    const next = current.includes(clinicType)
      ? current.filter((item) => item !== clinicType)
      : [...current, clinicType];
    updateField('applicable_clinic_types', next);
  };

  const validationSummary = useMemo(() => {
    const rule = formData.evaluation_rule;
    if (!rule) {
      return {
        valid: true,
        errors: [] as string[],
        warnings: ['No automated evaluation rule is applied. This measure will not auto-calculate.'],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (rule.type === 'lab_threshold') {
      const threshold = Number((rule.params as Record<string, unknown>).threshold ?? 0);
      const testName = String((rule.params as Record<string, unknown>).test_name ?? '');
      const testCode = String((rule.params as Record<string, unknown>).test_code ?? '');
      if (!testName && !testCode) {
        errors.push('Lab threshold rule requires test_name or test_code.');
      }
      if (!Number.isFinite(threshold) || threshold === 0) {
        errors.push('Lab threshold rule requires a non-zero threshold value.');
      }
      if (testName && !testCode) {
        warnings.push('Consider adding test_code (LOINC) for precise mapping.');
      }
    }

    if (rule.type === 'wait_time') {
      const maxMinutes = Number((rule.params as Record<string, unknown>).max_minutes ?? 0);
      if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
        errors.push('Wait time rule requires max_minutes greater than 0.');
      }
    }

    if (rule.type === 'visit_count') {
      const minVisits = Number((rule.params as Record<string, unknown>).min_visits ?? 0);
      if (!Number.isFinite(minVisits) || minVisits <= 0) {
        errors.push('Visit count rule requires min_visits greater than 0.');
      }
    }

    if ((formData.applicable_clinic_types ?? []).length === 0) {
      warnings.push('Measure applies to all clinic types. Select clinic types if scope should be limited.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }, [formData.applicable_clinic_types, formData.evaluation_rule]);

  const handlePreviewRule = async () => {
    setPreviewError(null);
    setPreviewResult(null);

    if (!formData.evaluation_rule) {
      setPreviewError('Apply an evaluation rule before testing.');
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
        evaluation_rule: formData.evaluation_rule,
        clinic_id: clinicId,
        year,
        period,
        period_type: previewConfig.period_type,
      });
      setPreviewResult(result);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to run rule preview.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Quality Measure"
        helpContent="Define a clinical quality measure (CQM) with numerator/denominator logic and target thresholds."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="code">Code *</Label>
                  <HelpPopover content="Unique identifier for this measure. Use a stable naming convention such as KE-CQM-001 so the measure can be referenced consistently in dashboards and reports." />
                </div>
                <Input
                  id="code"
                  placeholder="e.g., KE-CQM-001"
                  value={formData.code}
                  onChange={(e) => updateField('code', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="name">Name *</Label>
                  <HelpPopover content="Human-readable measure title shown to users and in reports, for example 'ANC 4+ Visits Rate'." />
                </div>
                <Input
                  id="name"
                  placeholder="e.g., ANC 4+ Visits Rate"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="description">Description</Label>
                <HelpPopover content="Optional plain-language explanation of what the measure tracks, why it matters, and how teams should interpret it." />
              </div>
              <Textarea
                id="description"
                placeholder="Describe what this measure tracks..."
                value={formData.description ?? ''}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Domain</Label>
                  <HelpPopover content="Categorizes the measure into a quality area (clinical, patient safety, efficiency, etc.) to improve filtering and governance." />
                </div>
                <Select
                  value={formData.domain}
                  onValueChange={(v) =>
                    updateField('domain', v as QualityMeasureCreateData['domain'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLINICAL">Clinical</SelectItem>
                    <SelectItem value="PATIENT_SAFETY">Patient Safety</SelectItem>
                    <SelectItem value="EFFICIENCY">Efficiency</SelectItem>
                    <SelectItem value="PATIENT_EXPERIENCE">Patient Experience</SelectItem>
                    <SelectItem value="PUBLIC_HEALTH">Public Health</SelectItem>
                    <SelectItem value="CARE_COORDINATION">Care Coordination</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Status</Label>
                  <HelpPopover content="DRAFT for setup/testing, ACTIVE for live reporting, RETIRED for historical measures no longer monitored." />
                </div>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    updateField('status', v as QualityMeasureCreateData['status'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Reporting Period</Label>
                  <HelpPopover content="Defines how often performance is evaluated and summarized: monthly, quarterly, or annual." />
                </div>
                <Select
                  value={formData.reporting_period}
                  onValueChange={(v) =>
                    updateField(
                      'reporting_period',
                      v as QualityMeasureCreateData['reporting_period'],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Applicable Clinic Types</Label>
                <HelpPopover content="Optional scope filter. If none are selected, this measure applies to all clinic types." />
              </div>
              {availableClinicTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active clinic types found in this facility.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableClinicTypes.map((clinicType) => {
                    const active = (formData.applicable_clinic_types ?? []).includes(clinicType);
                    return (
                      <Button
                        key={clinicType}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        onClick={() => toggleApplicableClinicType(clinicType)}
                      >
                        {clinicType}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Measure Logic */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Measure Logic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="numerator">Numerator Logic *</Label>
                <HelpPopover content="Define the events or patients counted as successes. Example: patients with at least 4 ANC visits." />
              </div>
              <Textarea
                id="numerator"
                placeholder="Describe the numerator population..."
                value={formData.numerator_logic}
                onChange={(e) =>
                  updateField('numerator_logic', e.target.value)
                }
                rows={3}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="denominator">Denominator Logic *</Label>
                <HelpPopover content="Define the eligible population the measure applies to. This is the total group against which numerator performance is measured." />
              </div>
              <Textarea
                id="denominator"
                placeholder="Describe the denominator population..."
                value={formData.denominator_logic}
                onChange={(e) =>
                  updateField('denominator_logic', e.target.value)
                }
                rows={3}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="exclusion">Exclusion Logic</Label>
                <HelpPopover content="Optional criteria for removing specific cases from denominator calculations, such as contraindications or incomplete data." />
              </div>
              <Textarea
                id="exclusion"
                placeholder="Describe any exclusion criteria..."
                value={formData.exclusion_logic ?? ''}
                onChange={(e) =>
                  updateField('exclusion_logic', e.target.value)
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Automated Evaluation Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Optional structured logic used by the evaluation engine. Drafts are review-only until you apply them.
              </p>
              <Button type="button" variant="outline" onClick={handleGenerateDraft}>
                Generate Draft from Narrative
              </Button>
            </div>

            {draftRule ? (
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <p className="font-medium">Draft Rule (Review Required)</p>
                <p><span className="text-muted-foreground">Type:</span> {draftRule.rule.type}</p>
                <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">{JSON.stringify(draftRule.rule.params, null, 2)}</pre>
                <p><span className="text-muted-foreground">Confidence:</span> {Math.round(draftRule.confidence * 100)}%</p>
                {draftRule.assumptions.length > 0 ? (
                  <div>
                    <p className="text-muted-foreground">Assumptions</p>
                    <ul className="list-disc pl-5">
                      {draftRule.assumptions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {draftRule.warnings.length > 0 ? (
                  <div>
                    <p className="text-muted-foreground">Warnings</p>
                    <ul className="list-disc pl-5">
                      {draftRule.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleApplyDraft}>Apply Draft</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraftRule(null)}>Discard Draft</Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Rule Type</Label>
                  <HelpPopover content="Choose the evaluator family. Each type has specific parameters validated by backend guardrails." />
                </div>
                <Select
                  value={manualRuleType || '__NONE__'}
                  onValueChange={(v) => setManualRuleType(v === '__NONE__' ? '' : (v as QualityEvaluationRuleType))}
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
                    <SelectItem value="immunization_completeness">Immunization Completeness</SelectItem>
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
                  <Input type="number" min="1" value={manualParams.min_visits} onChange={(e) => setManualParams((p) => ({ ...p, min_visits: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Enrollment Status</Label>
                  <Select value={manualParams.enrollment_status} onValueChange={(v) => setManualParams((p) => ({ ...p, enrollment_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input value={manualParams.test_name} onChange={(e) => setManualParams((p) => ({ ...p, test_name: e.target.value }))} placeholder="HbA1c" />
                </div>
                <div className="space-y-2">
                  <Label>Test Code (LOINC)</Label>
                  <Input value={manualParams.test_code} onChange={(e) => setManualParams((p) => ({ ...p, test_code: e.target.value }))} placeholder="4548-4" />
                </div>
                <div className="space-y-2">
                  <Label>Threshold</Label>
                  <Input type="number" step="0.01" value={manualParams.threshold} onChange={(e) => setManualParams((p) => ({ ...p, threshold: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Comparison</Label>
                  <Select value={manualParams.comparison} onValueChange={(v) => setManualParams((p) => ({ ...p, comparison: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input type="number" value={manualParams.systolic_max} onChange={(e) => setManualParams((p) => ({ ...p, systolic_max: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Diastolic Max</Label>
                  <Input type="number" value={manualParams.diastolic_max} onChange={(e) => setManualParams((p) => ({ ...p, diastolic_max: e.target.value }))} />
                </div>
              </div>
            ) : null}

            {manualRuleType === 'wait_time' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Max Minutes</Label>
                  <Input type="number" min="1" value={manualParams.max_minutes} onChange={(e) => setManualParams((p) => ({ ...p, max_minutes: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Data Source</Label>
                    <HelpPopover content="Choose where wait-time is measured from. Clinic Visit uses registration-to-consultation start. Triage Assessment uses arrival-to-triage start." />
                  </div>
                  <Select value={manualParams.wait_data_source} onValueChange={(v) => setManualParams((p) => ({ ...p, wait_data_source: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinic_visit">Clinic Visit</SelectItem>
                      <SelectItem value="triage_assessment">Triage Assessment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {manualRuleType === 'enrollment_active' ? (
              <div className="space-y-2 max-w-xs">
                <Label>Target Status</Label>
                <Select value={manualParams.target_status} onValueChange={(v) => setManualParams((p) => ({ ...p, target_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Select value={manualParams.tracer_only} onValueChange={(v) => setManualParams((p) => ({ ...p, tracer_only: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stock-out Threshold</Label>
                  <Input type="number" value={manualParams.stock_out_threshold} onChange={(e) => setManualParams((p) => ({ ...p, stock_out_threshold: e.target.value }))} />
                </div>
              </div>
            ) : null}

            {manualRuleType === 'immunization_completeness' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Vaccine Program</Label>
                  <Input value={manualParams.vaccine_program} onChange={(e) => setManualParams((p) => ({ ...p, vaccine_program: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Max Patient Age (Years)</Label>
                  <Input type="number" min="1" value={manualParams.max_patient_age_years} onChange={(e) => setManualParams((p) => ({ ...p, max_patient_age_years: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Strict Due In Period</Label>
                  <Select value={manualParams.strict_due_in_period} onValueChange={(v) => setManualParams((p) => ({ ...p, strict_due_in_period: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {manualRuleType === 'maternal_mortality_ratio' ? (
              <div className="space-y-2 max-w-xs">
                <Label>Ratio Multiplier</Label>
                <Input type="number" min="1" value={manualParams.ratio_multiplier} onChange={(e) => setManualParams((p) => ({ ...p, ratio_multiplier: e.target.value }))} />
              </div>
            ) : null}

            {manualRuleType === 'idsr_timeliness' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Deadline Days After Week End</Label>
                  <Input type="number" min="0" value={manualParams.deadline_days_after_week_end} onChange={(e) => setManualParams((p) => ({ ...p, deadline_days_after_week_end: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Include Approved</Label>
                  <Select value={manualParams.include_approved} onValueChange={(v) => setManualParams((p) => ({ ...p, include_approved: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Require DHIS2 Timestamp</Label>
                  <Select value={manualParams.require_dhis2_timestamp} onValueChange={(v) => setManualParams((p) => ({ ...p, require_dhis2_timestamp: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {manualRuleType === 'skilled_birth_attendance' ? (
              <p className="text-sm text-muted-foreground">Uses completed facility deliveries with documented attendant by default.</p>
            ) : null}

            {manualRuleType === 'tb_treatment_success' ? (
              <p className="text-sm text-muted-foreground">Uses TB enrollment outcomes in-period with success status/keywords defaults.</p>
            ) : null}

            <div className="flex gap-2 flex-wrap">
              <Button type="button" onClick={handleApplyManualRule}>Apply Manual Rule</Button>
              <Button type="button" variant="outline" onClick={() => updateField('evaluation_rule', null)}>Clear Applied Rule</Button>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium mb-1">Applied Rule (Saved with Measure)</p>
              {formData.evaluation_rule ? (
                <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">{JSON.stringify(formData.evaluation_rule, null, 2)}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">No structured evaluation rule applied.</p>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Rule Validation</p>
              {validationSummary.errors.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-destructive">
                  {validationSummary.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-emerald-700">Rule structure is valid for save.</p>
              )}
              {validationSummary.warnings.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {validationSummary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Test Rule (Dry Run)</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Clinic</Label>
                  <Select value={previewConfig.clinic_id} onValueChange={(v) => setPreviewConfig((p) => ({ ...p, clinic_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
                    <SelectContent>
                      {availableClinics.map((clinic) => (
                        <SelectItem key={clinic.id} value={String(clinic.id)}>{clinic.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input type="number" value={previewConfig.year} onChange={(e) => setPreviewConfig((p) => ({ ...p, year: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Period Type</Label>
                  <Select value={previewConfig.period_type} onValueChange={(v) => setPreviewConfig((p) => ({ ...p, period_type: v as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input type="number" value={previewConfig.period} onChange={(e) => setPreviewConfig((p) => ({ ...p, period: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handlePreviewRule} disabled={isPreviewPending || !validationSummary.valid}>
                  {isPreviewPending ? 'Testing...' : 'Run Test Rule'}
                </Button>
                {!validationSummary.valid ? <p className="text-xs text-muted-foreground self-center">Fix validation errors to run test.</p> : null}
              </div>

              {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}
              {previewResult ? (
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p><span className="text-muted-foreground">Numerator:</span> {previewResult.numerator}</p>
                  <p><span className="text-muted-foreground">Denominator:</span> {previewResult.denominator}</p>
                  <p><span className="text-muted-foreground">Percentage:</span> {previewResult.percentage}%</p>
                  <p><span className="text-muted-foreground">Notes:</span> {previewResult.notes || 'N/A'}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="target">Target Percentage (%)</Label>
                  <HelpPopover content="Desired benchmark performance. Teams should aim to meet or exceed this percentage." />
                </div>
                <Input
                  id="target"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g., 80.00"
                  value={formData.target_percentage ?? ''}
                  onChange={(e) =>
                    updateField(
                      'target_percentage',
                      e.target.value || null,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="low_threshold">Low Threshold (%)</Label>
                  <HelpPopover content="Minimum acceptable performance. Results below this threshold can be highlighted as underperforming." />
                </div>
                <Input
                  id="low_threshold"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g., 50.00"
                  value={formData.low_threshold ?? ''}
                  onChange={(e) =>
                    updateField(
                      'low_threshold',
                      e.target.value || null,
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="dhis2">DHIS2 Indicator ID</Label>
                  <HelpPopover content="Optional external indicator identifier for mapping this measure to DHIS2/KHIS reporting pipelines." />
                </div>
                <Input
                  id="dhis2"
                  placeholder="e.g., dE4xK23b..."
                  value={formData.dhis2_indicator_id ?? ''}
                  onChange={(e) =>
                    updateField('dhis2_indicator_id', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="reference">Reference URL</Label>
                  <HelpPopover content="Optional link to policy, guideline, or specification describing how this measure should be calculated and interpreted." />
                </div>
                <Input
                  id="reference"
                  type="url"
                  placeholder="https://..."
                  value={formData.reference_url ?? ''}
                  onChange={(e) =>
                    updateField('reference_url', e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Measure'}
          </Button>
        </div>
      </form>
    </div>
  );
}
