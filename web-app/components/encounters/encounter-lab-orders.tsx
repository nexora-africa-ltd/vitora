/**
 * Encounter Lab Orders Component
 * Shows lab orders for a specific encounter with ability to create new orders
 * Sprint 1.5-1.6 Track B: Lab Workflow Integration
 *
 * Note: Lab orders can be created at any time during the encounter.
 * Clinicians may need to order labs to inform diagnosis and treatment decisions.
 */
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Beaker, ExternalLink, Clock, CheckCircle2, AlertCircle, FileText, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { LabOrderDetail } from '@/components/laboratory/lab-order-detail';
import { formatDate } from '@/lib/utils/format';
import { EncounterLabResultsView } from './encounter-lab-results-view';
import type { PatientDemographics } from './encounter-lab-results-view';
import type { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';

interface EncounterLabOrdersProps {
  encounterId: number;
  patientId: number;
  disabled?: boolean;
  onNext?: () => void;
  /** Called before navigating to create lab order - use to save pending changes */
  onBeforeNavigate?: () => Promise<void>;
  /** Patient demographics for AI interpretation */
  patientDemographics?: PatientDemographics;
  /** Current diagnoses for AI interpretation context */
  diagnoses?: string[];
}

const STATUS_CONFIG: Record<LabOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: Clock },
  ORDERED: { label: 'Ordered', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  SPECIMEN_COLLECTED: { label: 'Sample Collected', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Beaker },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Clock },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; color: string }> = {
  ROUTINE: { label: 'Routine', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  URGENT: { label: 'Urgent', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  STAT: { label: 'STAT', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
};

export function EncounterLabOrders({ encounterId, patientId, disabled = false, onNext, onBeforeNavigate, patientDemographics, diagnoses }: EncounterLabOrdersProps) {
  const router = useRouter();
  const { data: orders, isLoading, error } = useEncounterLabOrders(encounterId);
  const [activeView, setActiveView] = useState<'orders' | 'results'>('orders');
  const [peekOrderNumber, setPeekOrderNumber] = useState<string | null>(null);

  // Handle navigation to new lab order - saves pending changes first
  const handleNewLabOrder = useCallback(async () => {
    if (onBeforeNavigate) {
      await onBeforeNavigate();
    }
    router.push(`/laboratory/orders/new?encounter=${encounterId}&patient=${patientId}`);
  }, [onBeforeNavigate, router, encounterId, patientId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Lab Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Lab Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load lab orders.</p>
        </CardContent>
      </Card>
    );
  }

  // Ensure orders is always an array (handle edge cases)
  const ordersList = Array.isArray(orders) ? orders : [];
  const pendingOrders = ordersList.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const completedOrders = ordersList.filter(o => o.status === 'COMPLETED');
  const hasResults = ordersList.some(o => o.items?.some(i => i.has_result));
  const resultsCount = ordersList.reduce((acc, o) => acc + (o.items?.filter(i => i.has_result).length || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Lab Orders
            {ordersList.length > 0 && (
              <Badge variant="secondary">{ordersList.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasResults && (
              <Button
                variant={activeView === 'results' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveView(activeView === 'results' ? 'orders' : 'results')}
              >
                {activeView === 'results' ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Hide Results
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    View Results ({resultsCount})
                  </>
                )}
              </Button>
            )}
            {!disabled && (
              <Button size="sm" onClick={handleNewLabOrder}>
                <Plus className="h-4 w-4 mr-1" />
                Order Lab Test
              </Button>
            )}
          </div>
        </div>
        {orders && orders.length === 0 && (
          <CardDescription>No lab orders for this encounter</CardDescription>
        )}
      </CardHeader>

      {orders && orders.length > 0 && (
        <CardContent className="space-y-4">
          {activeView === 'results' ? (
            /* Inline Lab Results View */
            <EncounterLabResultsView
              orders={ordersList}
              encounterId={encounterId}
              patientDemographics={patientDemographics}
              diagnoses={diagnoses}
            />
          ) : (
            <>
              {/* Pending Orders */}
              {pendingOrders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Pending ({pendingOrders.length})</h4>
                  <div className="space-y-2">
                    {pendingOrders.map((order) => (
                      <LabOrderCard key={order.order_number} order={order} onPeek={setPeekOrderNumber} />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Orders */}
              {completedOrders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Completed ({completedOrders.length})</h4>
                  <div className="space-y-2">
                    {completedOrders.map((order) => (
                      <LabOrderCard key={order.order_number} order={order} showResults onPeek={setPeekOrderNumber} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}

      {orders && orders.length === 0 && !disabled && (
        <CardFooter className="pt-0 flex-col gap-3">
          <Button variant="outline" className="w-full" onClick={handleNewLabOrder}>
            <Plus className="h-4 w-4 mr-2" />
            Order First Lab Test
          </Button>
          {onNext && (
            <Button variant="secondary" className="w-full" onClick={onNext}>
              Continue to Rx →
            </Button>
          )}
        </CardFooter>
      )}

      {/* Show continue button when there are orders */}
      {orders && orders.length > 0 && onNext && (
        <CardFooter className="pt-3">
          <Button variant="secondary" className="w-full" onClick={onNext}>
            Continue to Rx →
          </Button>
        </CardFooter>
      )}

      {/* Peek Panel Sheet */}
      <Sheet open={!!peekOrderNumber} onOpenChange={(open) => { if (!open) setPeekOrderNumber(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Lab Order {peekOrderNumber}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              {peekOrderNumber && <LabOrderDetail orderNumber={peekOrderNumber} />}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

interface EncounterLabOrdersContentProps {
  encounterId: number;
  patientId: number;
  disabled?: boolean;
  onBeforeNavigate?: () => Promise<void>;
  /** Patient demographics for AI interpretation */
  patientDemographics?: PatientDemographics;
  /** Current diagnoses for AI interpretation context */
  diagnoses?: string[];
}

/**
 * Content-only version of the Lab Orders component (no Card wrapper)
 * Used in accordion-based layouts
 */
export function EncounterLabOrdersContent({
  encounterId,
  patientId,
  disabled = false,
  onBeforeNavigate,
  patientDemographics,
  diagnoses,
}: EncounterLabOrdersContentProps) {
  const router = useRouter();
  const { data: orders, isLoading, error } = useEncounterLabOrders(encounterId);
  const [activeView, setActiveView] = useState<'orders' | 'results'>('orders');
  const [peekOrderNumber, setPeekOrderNumber] = useState<string | null>(null);

  const handleNewLabOrder = useCallback(async () => {
    if (onBeforeNavigate) {
      await onBeforeNavigate();
    }
    router.push(`/laboratory/orders/new?encounter=${encounterId}&patient=${patientId}`);
  }, [onBeforeNavigate, router, encounterId, patientId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">Failed to load lab orders.</p>;
  }

  const ordersList = Array.isArray(orders) ? orders : [];
  const pendingOrders = ordersList.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const completedOrders = ordersList.filter(o => o.status === 'COMPLETED');
  const hasResults = ordersList.some(o => o.items?.some(i => i.has_result));
  const resultsCount = ordersList.reduce((acc, o) => acc + (o.items?.filter(i => i.has_result).length || 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Order lab tests and view results
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {hasResults && (
          <Button
            variant={activeView === 'results' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveView(activeView === 'results' ? 'orders' : 'results')}
          >
            {activeView === 'results' ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                Hide Results
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                View Results ({resultsCount})
              </>
            )}
          </Button>
        )}
        {!disabled && (
          <Button size="sm" onClick={handleNewLabOrder}>
            <Plus className="h-4 w-4 mr-1" />
            Order Lab Test
          </Button>
        )}
      </div>

      {ordersList.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <Beaker className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No lab orders for this encounter</p>
        </div>
      ) : activeView === 'results' ? (
        <EncounterLabResultsView
          orders={ordersList}
          encounterId={encounterId}
          patientDemographics={patientDemographics}
          diagnoses={diagnoses}
        />
      ) : (
        <div className="space-y-4">
          {pendingOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Pending ({pendingOrders.length})</h4>
              <div className="space-y-2">
                {pendingOrders.map((order) => (
                  <LabOrderCard key={order.order_number} order={order} onPeek={setPeekOrderNumber} />
                ))}
              </div>
            </div>
          )}
          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Completed ({completedOrders.length})</h4>
              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <LabOrderCard key={order.order_number} order={order} showResults onPeek={setPeekOrderNumber} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Peek Panel Sheet */}
      <Sheet open={!!peekOrderNumber} onOpenChange={(open) => { if (!open) setPeekOrderNumber(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Lab Order {peekOrderNumber}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              {peekOrderNumber && <LabOrderDetail orderNumber={peekOrderNumber} />}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LabOrderCard({ order, showResults = false, onPeek }: { order: LabOrder; showResults?: boolean; onPeek?: (orderNumber: string) => void }) {
  const statusConfig = STATUS_CONFIG[order.status];
  const priorityConfig = PRIORITY_CONFIG[order.priority];
  const StatusIcon = statusConfig.icon;

  const testNames = order.items?.map(item => item.test_name).join(', ') || 'Unknown tests';

  const content = (
    <div className="p-3 rounded-md border hover:bg-muted/50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{order.order_number}</span>
            <Badge className={statusConfig.color} variant="secondary">
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
            {order.priority !== 'ROUTINE' && (
              <Badge className={priorityConfig.color} variant="secondary">
                {priorityConfig.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 truncate">{testNames}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ordered {formatDate(order.created_at)}
            {order.ordered_by_name && ` by ${order.ordered_by_name}`}
          </p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {/* Show results summary for completed orders */}
      {showResults && order.items && order.items.length > 0 && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>
              {order.items.filter(i => i.result).length} of {order.items.length} results available
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (onPeek) {
    return (
      <div role="button" tabIndex={0} onClick={() => onPeek(order.order_number)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPeek(order.order_number); }}>
        {content}
      </div>
    );
  }

  return <Link href={`/laboratory/orders/${order.order_number}`}>{content}</Link>;
}

export default EncounterLabOrders;
