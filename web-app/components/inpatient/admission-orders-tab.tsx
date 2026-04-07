/**
 * Admission Orders Tab Component
 * Displays lab orders, imaging orders, and prescriptions for an inpatient admission.
 * Sprint 1.7: Medical Orders Feature
 */
'use client';

import Link from 'next/link';
import { Beaker, ImageIcon, Pill, Syringe, Clock, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmissionOrders } from '@/lib/hooks/use-inpatient';
import { useQuery } from '@tanstack/react-query';
import { proceduresApi } from '@/lib/api/procedures';
import { PROCEDURE_STATUS_COLORS, PROCEDURE_STATUS_LABELS, PROCEDURE_PRIORITY_COLORS } from '@/lib/types/procedure';
import { formatDate } from '@/lib/utils/format';
import type { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';
import type { ImagingOrder, ImagingOrderStatus } from '@/lib/types/imaging';
import type { Prescription, PrescriptionStatus } from '@/lib/types/pharmacy';

interface AdmissionOrdersTabProps {
  admissionId: number;
  patientId: number;
  encounterId?: number;
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

export function AdmissionOrdersTab({ admissionId, patientId, encounterId, isActive = true }: AdmissionOrdersTabProps) {
  const { data: orders, isLoading, error } = useAdmissionOrders(admissionId);
  const { data: procOrdersData } = useQuery({
    queryKey: ['procedure-orders', { admission: admissionId }],
    queryFn: () => proceduresApi.listOrders({ admission: String(admissionId), page_size: '50' }),
    enabled: !!admissionId,
  });
  const procOrders = (procOrdersData?.results ?? []) as import('@/lib/types/procedure').ProcedureOrderListItem[];

  if (isLoading) {
    return <OrdersLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Failed to load orders</p>
      </div>
    );
  }

  const labOrders = orders?.lab_orders ?? [];
  const imagingOrders = orders?.imaging_orders ?? [];
  const prescriptions = orders?.prescriptions ?? [];
  const totalOrders = labOrders.length + imagingOrders.length + prescriptions.length + procOrders.length;

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {isActive && (
        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" size="sm" className="sm:px-3 w-full sm:w-auto" asChild>
            <Link href={`/laboratory/orders/new?admission=${admissionId}&patient=${patientId}${encounterId ? `&encounter=${encounterId}` : ''}`} title="New Lab Order">
              <Beaker className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">New Lab Order</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="sm:px-3 w-full sm:w-auto" asChild>
            <Link href={`/imaging/orders/new?admission=${admissionId}&patient=${patientId}${encounterId ? `&encounter=${encounterId}` : ''}`} title="New Imaging">
              <ImageIcon className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">New Imaging</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="sm:px-3 w-full sm:w-auto" asChild>
            <Link href={`/pharmacy/prescriptions/new?admission=${admissionId}&patient=${patientId}${encounterId ? `&encounter=${encounterId}` : ''}`} title="New Prescription">
              <Pill className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">New Prescription</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="sm:px-3 w-full sm:w-auto" asChild>
            <Link href={`/procedures/orders/new?admission=${admissionId}&patient=${patientId}${encounterId ? `&encounter=${encounterId}` : ''}`} title="New Procedure">
              <Syringe className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">New Procedure</span>
            </Link>
          </Button>
        </div>
      )}

      {totalOrders === 0 ? (
        <div className="py-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
            <Beaker className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No orders placed yet</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Lab Orders Card */}
          <OrdersSummaryCard
            icon={Beaker}
            title="Lab Orders"
            count={labOrders.length}
            items={labOrders.map((o) => ({
              id: o.id,
              label: o.order_number,
              sublabel: `${o.items?.length ?? 0} test${(o.items?.length ?? 0) !== 1 ? 's' : ''}`,
              status: o.status,
              statusConfig: LAB_STATUS_CONFIG[o.status],
              priorityConfig: PRIORITY_CONFIG[o.priority],
              date: o.ordered_at,
              href: `/laboratory/orders/${o.order_number}`,
            }))}
          />

          {/* Imaging Orders Card */}
          <OrdersSummaryCard
            icon={ImageIcon}
            title="Imaging"
            count={imagingOrders.length}
            items={imagingOrders.map((o) => ({
              id: o.id,
              label: o.order_number,
              sublabel: `${o.items?.length ?? 0} procedure${(o.items?.length ?? 0) !== 1 ? 's' : ''}`,
              status: o.status,
              statusConfig: IMAGING_STATUS_CONFIG[o.status],
              priorityConfig: PRIORITY_CONFIG[o.priority],
              date: o.ordered_at,
              href: `/imaging/orders/${o.order_number}`,
            }))}
          />

          {/* Prescriptions Card */}
          <OrdersSummaryCard
            icon={Pill}
            title="Prescriptions"
            count={prescriptions.length}
            items={prescriptions.map((rx) => ({
              id: rx.id,
              label: rx.prescription_number,
              sublabel: `${rx.items?.length ?? 0} med${(rx.items?.length ?? 0) !== 1 ? 's' : ''}`,
              status: rx.status,
              statusConfig: RX_STATUS_CONFIG[rx.status],
              date: rx.prescribed_date,
              href: `/pharmacy/prescriptions/${rx.id}`,
            }))}
          />

          {/* Procedure Orders Card */}
          <OrdersSummaryCard
            icon={Syringe}
            title="Procedures"
            count={procOrders.length}
            items={procOrders.map((o) => ({
              id: o.id,
              label: o.order_number,
              sublabel: o.procedure_name,
              status: o.status,
              statusConfig: {
                label: PROCEDURE_STATUS_LABELS[o.status as keyof typeof PROCEDURE_STATUS_LABELS] ?? o.status,
                color: PROCEDURE_STATUS_COLORS[o.status as keyof typeof PROCEDURE_STATUS_COLORS] ?? 'bg-gray-100 text-gray-800',
                icon: Clock,
              },
              ...(o.priority !== 'ROUTINE' ? {
                priorityConfig: {
                  label: o.priority,
                  color: PROCEDURE_PRIORITY_COLORS[o.priority as keyof typeof PROCEDURE_PRIORITY_COLORS] ?? 'bg-gray-100 text-gray-700',
                },
              } : {}),
              date: o.ordered_at,
              href: `/procedures/orders/${o.id}`,
            }))}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface OrderItem {
  id: number;
  label: string;
  sublabel: string;
  status: string;
  statusConfig: { label: string; color: string; icon: React.ElementType };
  priorityConfig?: { label: string; color: string };
  date: string;
  href: string;
}

interface OrdersSummaryCardProps {
  icon: React.ElementType;
  title: string;
  count: number;
  items: OrderItem[];
}

function OrdersSummaryCard({ icon: Icon, title, count, items }: OrdersSummaryCardProps) {
  if (count === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No orders</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </span>
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.slice(0, 3).map((item) => {
          const StatusIcon = item.statusConfig.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="block p-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center justify-between gap-1.5 mb-0.5">
                <span className="text-sm font-medium truncate">{item.label}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground truncate mb-1">
                {item.sublabel} · {formatDate(item.date)}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className={`${item.statusConfig.color} text-[10px] px-1.5 py-0`} variant="secondary">
                  <StatusIcon className="h-3 w-3 mr-0.5" />
                  {item.statusConfig.label}
                </Badge>
                {item.priorityConfig && item.priorityConfig.label !== 'Routine' && (
                  <Badge className={`${item.priorityConfig.color} text-[10px] px-1 py-0`} variant="secondary">
                    {item.priorityConfig.label}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
        {items.length > 3 && (
          <p className="text-xs text-muted-foreground pt-1">
            +{items.length - 3} more
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
