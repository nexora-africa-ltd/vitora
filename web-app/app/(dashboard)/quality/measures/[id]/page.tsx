'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { qualityApi } from '@/lib/api/quality';
import { formatDateTime } from '@/lib/utils/format';
import {
  Code2,
  Target,
  BarChart3,
  Link2,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import type { QualityMeasureDomain, QualityMeasureStatus } from '@/lib/types/quality';

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
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

export default function QualityMeasureDetailPage() {
  const params = useParams();
  const measureId = Number(params?.id);

  const { data: measure, isLoading, error } = useQuery({
    queryKey: ['quality-measure', measureId],
    queryFn: () => qualityApi.getMeasure(measureId),
    enabled: Number.isFinite(measureId),
  });

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
          <p className="text-destructive">
            Failed to load quality measure. It may not exist.
          </p>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="font-mono text-sm text-muted-foreground">
            {measure.code}
          </p>
          <p className="text-sm text-muted-foreground">
            {measure.reporting_period_display} reporting
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            className={`${DOMAIN_COLORS[measure.domain]} w-fit`}
            variant="secondary"
          >
            {measure.domain_display}
          </Badge>
          <Badge
            className={`${STATUS_COLORS[measure.status]} w-fit`}
            variant="secondary"
          >
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
              <CardTitle className="text-base sm:text-lg">
                Measure Logic
              </CardTitle>
              <HelpPopover content="The numerator defines patients meeting the measure criteria. The denominator defines the eligible population." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Numerator
              </p>
              <p className="text-sm bg-muted/50 rounded p-3 font-mono whitespace-pre-wrap">
                {measure.numerator_logic || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Denominator
              </p>
              <p className="text-sm bg-muted/50 rounded p-3 font-mono whitespace-pre-wrap">
                {measure.denominator_logic || '—'}
              </p>
            </div>
            {measure.exclusion_logic && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Exclusions
                </p>
                <p className="text-sm bg-muted/50 rounded p-3 font-mono whitespace-pre-wrap">
                  {measure.exclusion_logic}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thresholds & Configuration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Thresholds & Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow
              icon={Target}
              label="Target Percentage"
              value={
                measure.target_percentage
                  ? `${measure.target_percentage}%`
                  : 'Not set'
              }
            />
            <InfoRow
              icon={AlertTriangle}
              label="Low Threshold"
              value={
                measure.low_threshold
                  ? `${measure.low_threshold}%`
                  : 'Not set'
              }
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
                    className="text-primary hover:underline break-all"
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
                  <div className="flex gap-1 flex-wrap mt-1">
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

      {/* Timestamps */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:justify-between text-xs text-muted-foreground gap-1">
          <span>Created: {formatDateTime(measure.created_at)}</span>
          <span>Updated: {formatDateTime(measure.updated_at)}</span>
        </CardContent>
      </Card>
    </div>
  );
}
