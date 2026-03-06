/**
 * Laboratory Analytics Report Document Schema
 *
 * Defines the schema and defaults for lab analytics print documents.
 * Follows the same pattern as lab-report.schema.ts.
 */

import type { DocumentDefinition } from '../types';

export const labAnalyticsSchema: DocumentDefinition = {
  document_type: 'lab_analytics' as any,
  version: '1.0',
  layout: 'a4',
  template: 'lab-analytics.html',

  data_sources: {
    facility: 'facility',
    period: 'period',
    report: 'report',
    kpi: 'kpi',
    tat: 'tat',
    tat_priority: 'tat_priority',
    workload: 'workload',
    critical: 'critical',
    rejection: 'rejection',
  },

  bindings: {
    // Facility
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',

    // Period
    '{{period.label}}': 'period.label',
    '{{period.start}}': 'period.start',
    '{{period.end}}': 'period.end',

    // Report meta
    '{{report.generated_at}}': 'report.generated_at',

    // KPI cards
    '{{kpi.avg_tat}}': 'kpi.avg_tat',
    '{{kpi.results_verified}}': 'kpi.results_verified',
    '{{kpi.tests_verified}}': 'kpi.tests_verified',
    '{{kpi.tests_entered}}': 'kpi.tests_entered',
    '{{kpi.critical_count}}': 'kpi.critical_count',
    '{{kpi.critical_class}}': 'kpi.critical_class',
    '{{kpi.rejection_rate}}': 'kpi.rejection_rate',
    '{{kpi.rejected_orders}}': 'kpi.rejected_orders',
    '{{kpi.total_orders}}': 'kpi.total_orders',
    '{{kpi.rejection_class}}': 'kpi.rejection_class',

    // Section displays and rows
    '{{tat.display}}': 'tat.display',
    '{{tat.rows}}': 'tat.rows',
    '{{tat_priority.display}}': 'tat_priority.display',
    '{{tat_priority.rows}}': 'tat_priority.rows',
    '{{workload.display}}': 'workload.display',
    '{{workload.rows}}': 'workload.rows',
    '{{critical.display}}': 'critical.display',
    '{{critical.rows}}': 'critical.rows',
    '{{rejection.display}}': 'rejection.display',
    '{{rejection.rows}}': 'rejection.rows',

    // Footer
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'report.reference_url',
      placement: '.qr',
      width: 60,
      height: 60,
    },
  },
};

export const labAnalyticsDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
  },
  system_name: 'Vitora HMIS',
};

/**
 * KPI card CSS classes based on thresholds
 */
export const labAnalyticsKpiClasses = {
  critical: 'critical',
  warning: 'warning',
  success: 'success',
} as const;

/**
 * Calculate the appropriate KPI class based on critical count
 */
export function getCriticalClass(criticalCount: number): string {
  return criticalCount > 0 ? labAnalyticsKpiClasses.critical : labAnalyticsKpiClasses.success;
}

/**
 * Calculate the appropriate KPI class based on rejection rate
 */
export function getRejectionClass(rejectionRate: number): string {
  if (rejectionRate > 5) return labAnalyticsKpiClasses.critical;
  if (rejectionRate > 2) return labAnalyticsKpiClasses.warning;
  return labAnalyticsKpiClasses.success;
}
