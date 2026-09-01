/**
 * Encounter Lab Results View Component
 * Displays lab results inline within the encounter form
 * Allows clinicians to view results without navigating away
 * Includes per-order AI lab interpretation via TibaBot LabInterpretPanel
 * Sprint 1.5-1.6 Track B: Lab Workflow Integration
 */
'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Beaker,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { LabInterpretPanel } from './lab-interpret-panel';
import type { LabOrder, LabOrderItem, ResultFlag } from '@/lib/types/laboratory';
import type { AILabResultItem } from '@/lib/types/ai';
import Link from 'next/link';

export interface PatientDemographics {
  /** Patient age in years */
  patientAge: number;
  /** Patient sex for AI interpretation */
  patientSex: 'male' | 'female';
  /** Whether the patient is pregnant */
  isPregnant?: boolean;
  /** Gestational weeks if pregnant */
  gestationalWeeks?: number | null;
}

interface EncounterLabResultsViewProps {
  orders: LabOrder[];
  isLoading?: boolean;
  /** Encounter ID for AI interpretation persistence */
  encounterId?: number;
  /** Patient demographics for AI interpretation context */
  patientDemographics?: PatientDemographics;
  /** Current diagnoses for AI interpretation context */
  diagnoses?: string[];
}

const FLAG_CONFIG: Record<
  ResultFlag | string,
  { label: string; color: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  NORMAL: {
    label: 'Normal',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    variant: 'outline',
  },
  LOW: {
    label: 'Low',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    variant: 'secondary',
  },
  HIGH: {
    label: 'High',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    variant: 'secondary',
  },
  CRITICAL_LOW: {
    label: 'Critical Low',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    variant: 'destructive',
  },
  CRITICAL_HIGH: {
    label: 'Critical High',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    variant: 'destructive',
  },
  ABNORMAL: {
    label: 'Abnormal',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    variant: 'secondary',
  },
  POSITIVE: {
    label: 'Positive',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    variant: 'secondary',
  },
  NEGATIVE: {
    label: 'Negative',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    variant: 'outline',
  },
};

function ResultValue({ item }: { item: LabOrderItem }) {
  const result = item.result;
  if (!result) return <span className="text-muted-foreground">Pending</span>;

  const value = result.numeric_value ?? result.text_value ?? result.option_value;
  const flag = result.result_flag || 'NORMAL';
  const flagConfig = FLAG_CONFIG[flag] ?? FLAG_CONFIG.NORMAL;

  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold">
        {value !== null && value !== undefined ? String(value) : '-'}
        {result.result_unit && (
          <span className="ml-1 font-normal text-muted-foreground">{result.result_unit}</span>
        )}
      </span>
      <Badge className={flagConfig?.color} variant={flagConfig?.variant}>
        {flagConfig?.label}
      </Badge>
      {result.is_critical_result && <AlertTriangle className="h-4 w-4 text-destructive" />}
    </div>
  );
}

/** Convert completed order items to AILabResultItem[] for the interpret panel */
function orderItemsToAILabResults(items: LabOrderItem[]): AILabResultItem[] {
  return items
    .filter((i) => i.has_result && i.result && !i.is_panel)
    .map((i) => ({
      // Use snake_case normalized name for TibaBot compatibility
      // e.g., "Random Blood Sugar" → "random_blood_sugar", "Fasting Blood Sugar" → "fasting_blood_sugar"
      test_name: i.test_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
      value: i.result!.numeric_value ?? (parseFloat(String(i.result!.text_value)) || 0),
      unit: i.result!.result_unit || '',
      reference_low: i.result!.reference_low ?? undefined,
      reference_high: i.result!.reference_high ?? undefined,
      flag: i.result!.result_flag || '',
    }));
}

function LabOrderResults({
  order,
  encounterId,
  patientDemographics,
  diagnoses,
}: {
  order: LabOrder;
  encounterId?: number;
  patientDemographics?: PatientDemographics;
  diagnoses?: string[];
}) {
  const [isOpen, setIsOpen] = useState(true);

  const completedItems = order.items?.filter((i) => i.has_result && !i.is_panel) || [];
  const pendingItems = order.items?.filter((i) => !i.has_result && !i.is_panel) || [];
  const hasCritical = order.items?.some((i) => i.result?.is_critical_result);

  // Group items by panel parent for display
  const panelParents = order.items?.filter((i) => i.is_panel) || [];
  const panelChildMap = new Map<number, LabOrderItem[]>();
  for (const item of order.items || []) {
    if (item.panel_parent) {
      const children = panelChildMap.get(item.panel_parent) || [];
      children.push(item);
      panelChildMap.set(item.panel_parent, children);
    }
  }
  // Standalone items (not panel parents, not panel children)
  const standaloneCompleted = completedItems.filter((i) => !i.panel_parent);
  const standalonePending = pendingItems.filter((i) => !i.panel_parent);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn('overflow-hidden rounded-lg border', hasCritical && 'border-destructive/50')}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-muted/50',
              hasCritical && 'bg-destructive/5'
            )}
          >
            <div className="flex items-center gap-3">
              <Beaker className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{order.order_number}</span>
                  {hasCritical && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Critical
                    </Badge>
                  )}
                  {order.status === 'COMPLETED' && (
                    <Badge
                      variant="outline"
                      className="bg-green-100/50 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Complete
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {completedItems.length} of {order.items?.length || 0} results available
                  {order.completed_at && ` • Completed ${formatDate(order.completed_at)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                <Link href={`/laboratory/orders/${order.order_number}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2 border-t bg-muted/30 p-3">
            {/* Completed Results — Panel groups */}
            {panelParents.map((panel) => {
              const children = panelChildMap.get(panel.id) || [];
              const completedChildren = children.filter((c) => c.has_result);
              const pendingChildren = children.filter((c) => !c.has_result);
              if (children.length === 0) return null;
              return (
                <div key={panel.id} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {panel.test_name}
                  </p>
                  {completedChildren.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'ml-2 flex items-center justify-between rounded-md p-2',
                        item.result?.is_critical_result &&
                          'border border-destructive/20 bg-destructive/10'
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{item.test_name}</p>
                        {item.result?.reference_range_text && (
                          <p className="text-xs text-muted-foreground">
                            Ref: {item.result.reference_range_text}
                          </p>
                        )}
                      </div>
                      <ResultValue item={item} />
                    </div>
                  ))}
                  {pendingChildren.map((item) => (
                    <div
                      key={item.id}
                      className="ml-2 flex items-center justify-between rounded-md bg-muted/50 p-2"
                    >
                      <p className="text-sm">{item.test_name}</p>
                      <Badge variant="outline" className="text-xs">
                        <span className="animate-pulse">Awaiting</span>
                      </Badge>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Completed Results — Standalone */}
            {standaloneCompleted.length > 0 && (
              <div className="space-y-1">
                {standaloneCompleted.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between rounded-md p-2',
                      item.result?.is_critical_result &&
                        'border border-destructive/20 bg-destructive/10'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.test_name}</p>
                      {item.result?.reference_range_text && (
                        <p className="text-xs text-muted-foreground">
                          Ref: {item.result.reference_range_text}
                        </p>
                      )}
                    </div>
                    <ResultValue item={item} />
                  </div>
                ))}
              </div>
            )}

            {/* Pending Items — Standalone only (panel pending shown above) */}
            {standalonePending.length > 0 && (
              <div className="space-y-1 border-t pt-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Pending Results</p>
                {standalonePending.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                  >
                    <p className="text-sm">{item.test_name}</p>
                    <Badge variant="outline" className="text-xs">
                      <span className="animate-pulse">Awaiting results</span>
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Interpretation notes */}
            {completedItems.some((i) => i.result?.interpretation) && (
              <div className="border-t pt-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Interpretations</p>
                {completedItems
                  .filter((i) => i.result?.interpretation)
                  .map((item) => (
                    <div key={item.id} className="mb-1 rounded-md bg-muted p-2 text-sm">
                      <span className="font-medium">{item.test_name}:</span>{' '}
                      <span className="text-muted-foreground">{item.result?.interpretation}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* AI Lab Interpretation (per-order) */}
            {completedItems.length > 0 && patientDemographics && (
              <div className="border-t pt-2">
                <LabInterpretPanel
                  labResultId={completedItems[0]?.result?.id}
                  encounterId={encounterId}
                  patientAge={patientDemographics.patientAge}
                  patientSex={patientDemographics.patientSex}
                  isPregnant={patientDemographics.isPregnant}
                  gestationalWeeks={patientDemographics.gestationalWeeks}
                  labResults={orderItemsToAILabResults(completedItems)}
                  diagnoses={diagnoses}
                  autoTrigger
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function EncounterLabResultsView({
  orders,
  isLoading,
  encounterId,
  patientDemographics,
  diagnoses,
}: EncounterLabResultsViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const ordersWithResults = orders.filter(
    (o) => o.status === 'COMPLETED' || o.items?.some((i) => i.has_result)
  );

  if (ordersWithResults.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        <Beaker className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">No lab results available yet</p>
      </div>
    );
  }

  // Check for any critical results across all orders
  const hasCriticalResults = ordersWithResults.some((o) =>
    o.items?.some((i) => i.result?.is_critical_result)
  );

  return (
    <div className="space-y-3">
      {hasCriticalResults && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Critical Results Detected</p>
            <p className="text-xs text-destructive/80">
              One or more results require immediate clinical attention.
            </p>
          </div>
        </div>
      )}

      {ordersWithResults.map((order) => (
        <LabOrderResults
          key={order.order_number}
          order={order}
          encounterId={encounterId}
          patientDemographics={patientDemographics}
          diagnoses={diagnoses}
        />
      ))}
    </div>
  );
}

export default EncounterLabResultsView;
