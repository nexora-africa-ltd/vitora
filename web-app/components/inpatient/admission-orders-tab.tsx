/**
 * Admission Orders Tab Component
 * Displays lab orders, imaging orders, and prescriptions for an inpatient admission.
 * Sprint 1.7: Medical Orders Feature
 */
'use client';

import Link from 'next/link';
import { Beaker, ImageIcon, Pill, Clock, CheckCircle2, AlertCircle, Plus, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdmissionOrders } from '@/lib/hooks/use-inpatient';
import { formatDate } from '@/lib/utils/format';
import type { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';
import type { ImagingOrder, ImagingOrderStatus } from '@/lib/types/imaging';
import type { Prescription, PrescriptionStatus } from '@/lib/types/pharmacy';

interface AdmissionOrdersTabProps {
  admissionId: number;
  patientId: number;
  isActive?: boolean;
}

// ============================================================================
// Status Configurations
// ============================================================================

const LAB_STATUS_CONFIG: Record<LabOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: Clock },
  ORDERED: { label: 'Ordered', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  SPECIMEN_COLLECTED: { label: 'Collected', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Beaker },
  IN_PROGRESS: { label: 'Processing', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Clock },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: AlertCircle },
};

const IMAGING_STATUS_CONFIG: Record<ImagingOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: Clock },
  ORDERED: { label: 'Ordered', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  SCHEDULED: { label: 'Scheduled', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Clock },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  REPORTED: { label: 'Reported', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
};

const RX_STATUS_CONFIG: Record<PrescriptionStatus, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  PARTIAL: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Pill },
  DISPENSED: { label: 'Dispensed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
  EXPIRED: { label: 'Expired', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; color: string }> = {
  ROUTINE: { label: 'Routine', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  URGENT: { label: 'Urgent', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  STAT: { label: 'STAT', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
};

// ============================================================================
// Main Component
// ============================================================================

export function AdmissionOrdersTab({ admissionId, patientId, isActive = true }: AdmissionOrdersTabProps) {
  const { data: orders, isLoading, error } = useAdmissionOrders(admissionId);

  if (isLoading) {
    return <OrdersLoadingSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Failed to load orders. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  const labOrders = orders?.lab_orders ?? [];
  const imagingOrders = orders?.imaging_orders ?? [];
  const prescriptions = orders?.prescriptions ?? [];
  const totalOrders = labOrders.length + imagingOrders.length + prescriptions.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h3 className="text-lg font-semibold">Medical Orders</h3>
          <p className="text-sm text-muted-foreground">
            {totalOrders} order{totalOrders !== 1 ? 's' : ''} for this admission
          </p>
        </div>
        {isActive && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/laboratory/orders/new?admission=${admissionId}&patient=${patientId}`}>
                <Beaker className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Lab Order</span>
                <span className="sm:hidden">Lab</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/imaging/orders/new?admission=${admissionId}&patient=${patientId}`}>
                <ImageIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Imaging</span>
                <span className="sm:hidden">Img</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/pharmacy/prescriptions/new?admission=${admissionId}&patient=${patientId}`}>
                <Pill className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Prescription</span>
                <span className="sm:hidden">Rx</span>
              </Link>
            </Button>
          </div>
        )}
      </div>

      {totalOrders === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No orders have been placed for this admission yet.</p>
            {isActive && (
              <p className="text-sm text-muted-foreground mt-2">
                Use the buttons above to create lab, imaging, or prescription orders.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all" className="gap-1.5">
              All
              <Badge variant="secondary" className="ml-1">{totalOrders}</Badge>
            </TabsTrigger>
            <TabsTrigger value="lab" className="gap-1.5">
              <Beaker className="h-4 w-4" />
              <span className="hidden sm:inline">Lab</span>
              {labOrders.length > 0 && <Badge variant="secondary">{labOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="imaging" className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Imaging</span>
              {imagingOrders.length > 0 && <Badge variant="secondary">{imagingOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="gap-1.5">
              <Pill className="h-4 w-4" />
              <span className="hidden sm:inline">Rx</span>
              {prescriptions.length > 0 && <Badge variant="secondary">{prescriptions.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {labOrders.length > 0 && <LabOrdersList orders={labOrders} />}
            {imagingOrders.length > 0 && <ImagingOrdersList orders={imagingOrders} />}
            {prescriptions.length > 0 && <PrescriptionsList prescriptions={prescriptions} />}
          </TabsContent>

          <TabsContent value="lab" className="space-y-4">
            {labOrders.length > 0 ? (
              <LabOrdersList orders={labOrders} />
            ) : (
              <EmptySection title="No lab orders" description="No lab orders for this admission." />
            )}
          </TabsContent>

          <TabsContent value="imaging" className="space-y-4">
            {imagingOrders.length > 0 ? (
              <ImagingOrdersList orders={imagingOrders} />
            ) : (
              <EmptySection title="No imaging orders" description="No imaging orders for this admission." />
            )}
          </TabsContent>

          <TabsContent value="prescriptions" className="space-y-4">
            {prescriptions.length > 0 ? (
              <PrescriptionsList prescriptions={prescriptions} />
            ) : (
              <EmptySection title="No prescriptions" description="No prescriptions for this admission." />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function LabOrdersList({ orders }: { orders: LabOrder[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Beaker className="h-5 w-5" />
          Lab Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((order) => {
          const config = LAB_STATUS_CONFIG[order.status];
          const StatusIcon = config.icon;
          const priorityConfig = PRIORITY_CONFIG[order.priority];

          return (
            <Link
              key={order.id}
              href={`/laboratory/orders/${order.order_number}`}
              className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{order.order_number}</span>
                    <Badge className={priorityConfig.color} variant="secondary">
                      {priorityConfig.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {order.items?.length ?? 0} test{(order.items?.length ?? 0) !== 1 ? 's' : ''}
                    {order.items?.slice(0, 2).map((item, idx) => (
                      <span key={item.id}>
                        {idx === 0 ? ': ' : ', '}
                        {item.test_name}
                      </span>
                    ))}
                    {(order.items?.length ?? 0) > 2 && ` +${(order.items?.length ?? 0) - 2} more`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(order.ordered_at)}
                  </p>
                </div>
                <Badge className={config.color} variant="secondary">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ImagingOrdersList({ orders }: { orders: ImagingOrder[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Imaging Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((order) => {
          const config = IMAGING_STATUS_CONFIG[order.status];
          const StatusIcon = config.icon;
          const priorityConfig = PRIORITY_CONFIG[order.priority];

          return (
            <Link
              key={order.id}
              href={`/imaging/orders/${order.order_number}`}
              className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{order.order_number}</span>
                    <Badge className={priorityConfig.color} variant="secondary">
                      {priorityConfig.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {order.items?.length ?? 0} procedure{(order.items?.length ?? 0) !== 1 ? 's' : ''}
                    {order.items?.slice(0, 2).map((item, idx) => (
                      <span key={item.id}>
                        {idx === 0 ? ': ' : ', '}
                        {item.procedure_name}
                      </span>
                    ))}
                    {(order.items?.length ?? 0) > 2 && ` +${(order.items?.length ?? 0) - 2} more`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(order.ordered_at)}
                  </p>
                </div>
                <Badge className={config.color} variant="secondary">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PrescriptionsList({ prescriptions }: { prescriptions: Prescription[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Pill className="h-5 w-5" />
          Prescriptions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prescriptions.map((rx) => {
          const config = RX_STATUS_CONFIG[rx.status];
          const StatusIcon = config.icon;

          return (
            <Link
              key={rx.id}
              href={`/pharmacy/prescriptions/${rx.prescription_number}`}
              className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{rx.prescription_number}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {rx.items?.length ?? 0} medication{(rx.items?.length ?? 0) !== 1 ? 's' : ''}
                    {rx.items?.slice(0, 2).map((item, idx) => (
                      <span key={item.id}>
                        {idx === 0 ? ': ' : ', '}
                        {item.drug_name}
                      </span>
                    ))}
                    {(rx.items?.length ?? 0) > 2 && ` +${(rx.items?.length ?? 0) - 2} more`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(rx.prescribed_date)}
                  </p>
                </div>
                <Badge className={config.color} variant="secondary">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EmptySection({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function OrdersLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
