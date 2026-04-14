/**
 * Encounter Lab Results View Component
 * Displays lab results inline within the encounter form
 * Allows clinicians to view results without navigating away
 * Includes per-order AI lab interpretation via TibaBot LabInterpretPanel
 * Sprint 1.5-1.6 Track B: Lab Workflow Integration
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Beaker, AlertTriangle, CheckCircle, ExternalLink, XCircle } from 'lucide-react';
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

const FLAG_CONFIG: Record<ResultFlag | string, { label: string; color: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  NORMAL: { label: 'Normal', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', variant: 'outline' },
  LOW: { label: 'Low', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', variant: 'secondary' },
  HIGH: { label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', variant: 'secondary' },
  CRITICAL_LOW: { label: 'Critical Low', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', variant: 'destructive' },
  CRITICAL_HIGH: { label: 'Critical High', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', variant: 'destructive' },
  ABNORMAL: { label: 'Abnormal', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', variant: 'secondary' },
  POSITIVE: { label: 'Positive', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', variant: 'secondary' },
  NEGATIVE: { label: 'Negative', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', variant: 'outline' },
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
          <span className="text-muted-foreground font-normal ml-1">{result.result_unit}</span>
        )}
      </span>
      <Badge className={flagConfig?.color} variant={flagConfig?.variant}>
        {flagConfig?.label}
      </Badge>
      {result.is_critical_result && (
        <AlertTriangle className="h-4 w-4 text-destructive" />
      )}
    </div>
  );
}

/** Convert completed order items to AILabResultItem[] for the interpret panel */
function orderItemsToAILabResults(items: LabOrderItem[]): AILabResultItem[] {
  return items
    .filter((i) => i.has_result && i.result)
    .map((i) => ({
      test_name: i.test_name,
      value: i.result!.numeric_value ?? (parseFloat(String(i.result!.text_value)) || 0),
      unit: i.result!.result_unit || '',
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

  const completedItems = order.items?.filter(i => i.has_result) || [];
  const pendingItems = order.items?.filter(i => !i.has_result) || [];
  const hasCritical = order.items?.some(i => i.result?.is_critical_result);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn(
        'border rounded-lg overflow-hidden',
        hasCritical && 'border-destructive/50'
      )}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left',
              hasCritical && 'bg-destructive/5'
            )}
          >
            <div className="flex items-center gap-3">
              <Beaker className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{order.order_number}</span>
                  {hasCritical && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Critical
                    </Badge>
                  )}
                  {order.status === 'COMPLETED' && (
                    <Badge variant="outline" className="text-xs bg-green-100/50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Complete
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
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
          <div className="border-t p-3 space-y-2 bg-muted/30">
            {/* Completed Results */}
            {completedItems.length > 0 && (
              <div className="space-y-1">
                {completedItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-md',
                      item.result?.is_critical_result && 'bg-destructive/10 border border-destructive/20'
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

            {/* Pending Items */}
            {pendingItems.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs text-muted-foreground font-medium mb-2">Pending Results</p>
                {pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
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
            {completedItems.some(i => i.result?.interpretation) && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground font-medium mb-2">Interpretations</p>
                {completedItems
                  .filter(i => i.result?.interpretation)
                  .map((item) => (
                    <div key={item.id} className="text-sm p-2 bg-muted rounded-md mb-1">
                      <span className="font-medium">{item.test_name}:</span>{' '}
                      <span className="text-muted-foreground">{item.result?.interpretation}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* AI Lab Interpretation (per-order) */}
            {completedItems.length > 0 && patientDemographics && (
              <div className="pt-2 border-t">
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
    o => o.status === 'COMPLETED' || o.items?.some(i => i.has_result)
  );

  if (ordersWithResults.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Beaker className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No lab results available yet</p>
      </div>
    );
  }

  // Check for any critical results across all orders
  const hasCriticalResults = ordersWithResults.some(
    o => o.items?.some(i => i.result?.is_critical_result)
  );

  return (
    <div className="space-y-3">
      {hasCriticalResults && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive text-sm">Critical Results Detected</p>
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
