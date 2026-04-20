/**
 * Encounter Procedure Orders Component
 *
 * Shows procedure orders linked to a specific encounter, clinic visit,
 * or admission, with ability to create new orders.
 *
 * Reused across:
 *  - Encounter edit orders page (as a tab)
 *  - Clinic visit detail page (as a card section)
 */
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Syringe, ExternalLink, Clock, CheckCircle2, AlertCircle, XCircle, PlayCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { proceduresApi } from '@/lib/api/procedures';
import { PROCEDURE_STATUS_COLORS, PROCEDURE_STATUS_LABELS, PROCEDURE_PRIORITY_COLORS } from '@/lib/types/procedure';
import { ProcedureOrderForm } from '@/components/procedures/procedure-order-form';
import type { ProcedureOrderListItem } from '@/lib/types/procedure';

interface EncounterProcedureOrdersProps {
  encounterId?: number;
  clinicVisitId?: number;
  admissionId?: number;
  patientId: number;
  disabled?: boolean;
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  ORDERED: Clock,
  CONSENT_PENDING: AlertCircle,
  SCHEDULED: Clock,
  READY: PlayCircle,
  IN_PROGRESS: PlayCircle,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
};

export function EncounterProcedureOrders({
  encounterId,
  clinicVisitId,
  admissionId,
  patientId,
  disabled = false,
}: EncounterProcedureOrdersProps) {
  const queryClient = useQueryClient();

  // Build filter params
  const filterParams: Record<string, string> = {};
  if (encounterId) filterParams.encounter = String(encounterId);
  if (clinicVisitId) filterParams.clinic_visit = String(clinicVisitId);
  if (admissionId) filterParams.admission = String(admissionId);

  const {
    data: ordersData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['procedure-orders', filterParams],
    queryFn: () => proceduresApi.listOrders({ ...filterParams, page_size: '50' }),
    enabled: !!(encounterId || clinicVisitId || admissionId),
  });

  const orders = (ordersData?.results ?? []) as ProcedureOrderListItem[];
  const [showOrderForm, setShowOrderForm] = useState(false);

  const handleOrderCreated = useCallback(() => {
    setShowOrderForm(false);
    queryClient.invalidateQueries({ queryKey: ['procedure-orders', filterParams] });
  }, [queryClient, filterParams]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Syringe className="h-5 w-5" />
            Procedure Orders
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
            <Syringe className="h-5 w-5" />
            Procedure Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load procedure orders.</p>
        </CardContent>
      </Card>
    );
  }

  const activeOrders = orders.filter(
    (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED',
  );
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED');
  const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Syringe className="h-5 w-5" />
            Procedure Orders
            {orders.length > 0 && (
              <Badge variant="secondary">{orders.length}</Badge>
            )}
          </CardTitle>
          {!disabled && (
            <Button size="sm" onClick={() => setShowOrderForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Order Procedure</span>
              <span className="sm:hidden">Order</span>
            </Button>
          )}
        </div>
        {orders.length === 0 && (
          <CardDescription>No procedure orders for this {encounterId ? 'encounter' : clinicVisitId ? 'visit' : 'admission'}</CardDescription>
        )}
      </CardHeader>

      {orders.length > 0 && (
        <CardContent className="space-y-4">
          {/* Active Orders */}
          {activeOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Active ({activeOrders.length})
              </h4>
              <div className="space-y-2">
                {activeOrders.map((order) => (
                  <ProcedureOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Orders */}
          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Completed ({completedOrders.length})
              </h4>
              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <ProcedureOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled Orders */}
          {cancelledOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Cancelled ({cancelledOrders.length})
              </h4>
              <div className="space-y-2">
                {cancelledOrders.map((order) => (
                  <ProcedureOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* New Procedure Order Sheet */}
      <Sheet open={showOrderForm} onOpenChange={setShowOrderForm}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>New Procedure Order</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              <ProcedureOrderForm
                patientId={patientId}
                encounterId={encounterId}
                clinicVisitId={clinicVisitId}
                admissionId={admissionId}
                onSuccess={handleOrderCreated}
                onCancel={() => setShowOrderForm(false)}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

/**
 * Content-only version of Procedure Orders (no Card wrapper).
 * Used in the encounter edit orders tabs and accordion layouts.
 */
export function EncounterProcedureOrdersContent({
  encounterId,
  clinicVisitId,
  admissionId,
  patientId,
  disabled = false,
}: EncounterProcedureOrdersProps) {
  const queryClient = useQueryClient();

  const filterParams: Record<string, string> = {};
  if (encounterId) filterParams.encounter = String(encounterId);
  if (clinicVisitId) filterParams.clinic_visit = String(clinicVisitId);
  if (admissionId) filterParams.admission = String(admissionId);

  const { data: ordersData, isLoading, error } = useQuery({
    queryKey: ['procedure-orders-content', filterParams],
    queryFn: () => proceduresApi.listOrders({ ...filterParams, page_size: '50' }),
    enabled: !!(encounterId || clinicVisitId || admissionId),
  });

  const orders = (ordersData?.results ?? []) as ProcedureOrderListItem[];
  const [showOrderForm, setShowOrderForm] = useState(false);

  const handleOrderCreated = useCallback(() => {
    setShowOrderForm(false);
    queryClient.invalidateQueries({ queryKey: ['procedure-orders-content', filterParams] });
  }, [queryClient, filterParams]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">Failed to load procedure orders.</p>;
  }

  const activeOrders = orders.filter(
    (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED',
  );
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Minor procedures, wound care, and surgical procedures
      </p>

      {/* Action button */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowOrderForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Order Procedure
          </Button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <Syringe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No procedure orders for this {encounterId ? 'encounter' : clinicVisitId ? 'visit' : 'admission'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Active ({activeOrders.length})
              </h4>
              <div className="space-y-2">
                {activeOrders.map((order) => (
                  <ProcedureOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}
          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Completed ({completedOrders.length})
              </h4>
              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <ProcedureOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Procedure Order Sheet */}
      <Sheet open={showOrderForm} onOpenChange={setShowOrderForm}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>New Procedure Order</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              <ProcedureOrderForm
                patientId={patientId}
                encounterId={encounterId}
                clinicVisitId={clinicVisitId}
                admissionId={admissionId}
                onSuccess={handleOrderCreated}
                onCancel={() => setShowOrderForm(false)}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProcedureOrderCard({ order }: { order: ProcedureOrderListItem }) {
  const StatusIcon = STATUS_ICONS[order.status] ?? Clock;
  const statusLabel = PROCEDURE_STATUS_LABELS[order.status] ?? order.status;
  const statusColor = PROCEDURE_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-800';
  const priorityColor = PROCEDURE_PRIORITY_COLORS[order.priority] ?? 'bg-gray-100 text-gray-700';

  return (
    <Link
      href={`/procedures/orders/${order.id}`}
      className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <StatusIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {order.procedure_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.order_number}
              {order.scheduled_date && ` · ${order.scheduled_date}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className={`text-xs ${priorityColor}`}>
            {order.priority}
          </Badge>
          <Badge className={`text-xs ${statusColor}`}>
            {statusLabel}
          </Badge>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}
