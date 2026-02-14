/**
 * Patient Imaging Section Component
 * Displays imaging orders and DICOM studies for a patient in their profile.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { imagingApi } from '@/lib/api/imaging';
import {
  ImagingOrder,
  DICOMStudy,
  ImagingModality,
  STATUS_LABELS,
  MODALITY_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/imaging';
import { OrderStatusBadge, ModalityBadge, PriorityBadge } from '@/components/imaging';
import { formatDate } from '@/lib/utils/format';
import {
  ScanLine,
  Image as ImageIcon,
  Eye,
  Plus,
  ClipboardList,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface PatientImagingSectionProps {
  patientId: number;
}

export function PatientImagingSection({ patientId }: PatientImagingSectionProps) {
  const router = useRouter();

  // Fetch imaging orders for this patient
  const {
    data: ordersData,
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['patient-imaging-orders', patientId],
    queryFn: () => imagingApi.listOrders({ patient: patientId, page_size: 10 }),
    staleTime: 30000,
  });

  // Fetch DICOM studies for this patient
  const {
    data: studiesData,
    isLoading: studiesLoading,
    refetch: refetchStudies,
  } = useQuery({
    queryKey: ['patient-dicom-studies', patientId],
    queryFn: () => imagingApi.listStudies({ patient: patientId, page_size: 10 }),
    staleTime: 30000,
  });

  const orders = ordersData?.results || [];
  const studies = studiesData?.results || [];
  const isLoading = ordersLoading || studiesLoading;

  const handleRefresh = () => {
    refetchOrders();
    refetchStudies();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            <CardTitle className="text-lg">Imaging</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" asChild>
              <Link href={`/imaging/orders/new?patient=${patientId}`}>
                <Plus className="h-4 w-4 mr-1.5" />
                Order
              </Link>
            </Button>
          </div>
        </div>
        <CardDescription>
          Imaging orders and DICOM studies for this patient
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : orders.length === 0 && studies.length === 0 ? (
          <div className="text-center py-8">
            <ScanLine className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground">No imaging records found</p>
            <Button
              variant="outline"
              className="mt-4"
              asChild
            >
              <Link href={`/imaging/orders/new?patient=${patientId}`}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Imaging Order
              </Link>
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="orders" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="orders" className="gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Orders ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="images" className="gap-1.5">
                <ImageIcon className="h-4 w-4" />
                Images ({studies.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="space-y-3">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No imaging orders yet
                </p>
              ) : (
                orders.map((order: ImagingOrder) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/imaging/orders/${order.order_number}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium">
                          {order.order_number}
                        </span>
                        <OrderStatusBadge status={order.status} />
                        <PriorityBadge priority={order.priority} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {order.items?.map((item) => item.procedure_name).join(', ') || 'No procedures'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(order.ordered_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {order.study_instance_uid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/imaging/studies/${order.study_instance_uid}`);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      )}
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
              {orders.length > 0 && (
                <Button variant="ghost" className="w-full" asChild>
                  <Link href={`/imaging?patient=${patientId}`}>
                    View All Orders
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              )}
            </TabsContent>

            <TabsContent value="images" className="space-y-3">
              {studies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No DICOM images available
                </p>
              ) : (
                studies.map((study: DICOMStudy) => (
                  <div
                    key={study.study_instance_uid}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/imaging/studies/${study.study_instance_uid}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <ModalityBadge modality={study.modality as ImagingModality} />
                        <span className="text-sm font-medium truncate">
                          {study.study_description || 'Unknown Study'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {study.number_of_instances} images • {formatDate(study.study_date)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/imaging/studies/${study.study_instance_uid}`);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
