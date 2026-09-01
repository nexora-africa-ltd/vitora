/**
 * Imaging module main page.
 * Displays orders with tabs for orders, worklist, schedule, studies, and procedures.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  SquareDashedTopSolid,
  Activity,
  BookOpen,
  CalendarDays,
  Image as ImageIcon,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ImagingOrderTable,
  ImagingWorklist,
  SchedulingCalendar,
  ModalityBadge,
} from '@/components/imaging';
import { useImagingOrders, useImagingProcedures } from '@/lib/hooks/use-imaging';
import { imagingApi } from '@/lib/api/imaging';
import {
  ImagingOrderStatus,
  ImagingPriority,
  ImagingProcedure,
  ImagingModality,
  DICOMStudy,
  MODALITY_LABELS,
} from '@/lib/types/imaging';
import { formatDate, formatBytes } from '@/lib/utils/format';
import { useFacility } from '@/lib/context/facility-context';
import { useImagingSocket } from '@/lib/hooks/use-websocket';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function ImagingPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canCreateImagingOrder = hasPermission('imaging.add_imagingorder');
  const { facility } = useFacility();
  useImagingSocket(facility?.id ?? null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ImagingOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ImagingPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useImagingOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });

  const orders = data?.results || [];
  const totalCount = data?.count || 0;
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Imaging</h1>
          <p className="hidden text-muted-foreground sm:block">
            Manage imaging orders, view worklist, and track procedures
          </p>
        </div>
        {canCreateImagingOrder ? (
          <Button onClick={() => router.push('/imaging/orders/new')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Imaging Order
          </Button>
        ) : null}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="orders" className="gap-1.5 px-2 sm:px-4">
            <SquareDashedTopSolid className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Orders</span>
          </TabsTrigger>
          <TabsTrigger value="worklist" className="gap-1.5 px-2 sm:px-4">
            <Activity className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Worklist</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 px-2 sm:px-4">
            <CalendarDays className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5 px-2 sm:px-4">
            <ImageIcon className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="procedures" className="gap-1.5 px-2 sm:px-4">
            <BookOpen className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Catalog</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <ImagingOrderTable
            orders={orders}
            isLoading={isLoading}
            error={error as Error | null}
            page={page}
            totalCount={totalCount}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={setPage}
            onStatusFilter={setStatusFilter}
            onPriorityFilter={setPriorityFilter}
            onSearch={setSearchQuery}
          />
        </TabsContent>

        <TabsContent value="worklist">
          <ImagingWorklist />
        </TabsContent>

        <TabsContent value="schedule">
          <SchedulingCalendar />
        </TabsContent>

        <TabsContent value="images">
          <DICOMStudiesView />
        </TabsContent>

        <TabsContent value="procedures">
          <ProcedureCatalogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// DICOM Studies view component
function DICOMStudiesView() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Fetch studies
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dicom-studies-tab', page, modalityFilter],
    queryFn: () =>
      imagingApi.listStudies({
        page,
        page_size: pageSize,
        ...(modalityFilter !== 'all' && { modality: modalityFilter }),
      }),
    staleTime: 30000,
  });

  // Filter by search
  const studies =
    data?.results?.filter((study: DICOMStudy) => {
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      return (
        study.patient_name?.toLowerCase().includes(lower) ||
        study.accession_number?.toLowerCase().includes(lower) ||
        study.study_description?.toLowerCase().includes(lower)
      );
    }) || [];

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Header with search and filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patient, accession..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={modalityFilter} onValueChange={setModalityFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Modalities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modalities</SelectItem>
                {Object.entries(MODALITY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Studies Table */}
      <Card>
        <CardContent className="p-0 sm:p-4">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">
              <p>Failed to load studies</p>
              <Button variant="outline" onClick={() => refetch()} className="mt-4">
                Try Again
              </Button>
            </div>
          ) : studies.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ImageIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No DICOM studies found</p>
            </div>
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Images</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studies.map((study: DICOMStudy) => (
                      <TableRow
                        key={study.study_instance_uid}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/imaging/studies/${study.study_instance_uid}`)}
                      >
                        <TableCell className="font-medium">
                          {study.patient_name || 'Unknown'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {study.study_description || 'No description'}
                        </TableCell>
                        <TableCell>
                          <ModalityBadge modality={study.modality as ImagingModality} />
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(study.study_date)}</TableCell>
                        <TableCell className="text-sm">{study.number_of_instances}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile view - cards */}
              <div className="space-y-3 p-4 md:hidden">
                {studies.map((study: DICOMStudy) => (
                  <div
                    key={study.study_instance_uid}
                    className="cursor-pointer rounded-lg border p-3 hover:bg-muted/50"
                    onClick={() => router.push(`/imaging/studies/${study.study_instance_uid}`)}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="truncate font-medium">
                        {study.patient_name || 'Unknown'}
                      </span>
                      <ModalityBadge modality={study.modality as ImagingModality} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {study.study_description || 'No description'}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDate(study.study_date)}</span>
                      <span>{study.number_of_instances} images</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t p-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Procedure catalog component
function ProcedureCatalogView() {
  const [page, setPage] = useState(1);
  const [modalityFilter, setModalityFilter] = useState<ImagingModality | ''>('');
  const pageSize = 50;

  const { data, isLoading } = useImagingProcedures({
    page,
    page_size: pageSize,
    modality: modalityFilter || undefined,
  });

  const procedures = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Procedure Catalog ({totalCount} procedures)</h3>
        <Select
          value={modalityFilter}
          onValueChange={(v) => {
            setModalityFilter(v as ImagingModality | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All modalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All modalities</SelectItem>
            {Object.entries(MODALITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border p-4">
                <div className="mb-2 h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            ))
          : procedures.map((procedure: ImagingProcedure) => (
              <div
                key={procedure.id}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm text-muted-foreground">{procedure.code}</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{procedure.modality}</span>
                </div>
                <p className="font-medium">{procedure.name}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>KES {procedure.cost.toLocaleString()}</span>
                </div>
              </div>
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
