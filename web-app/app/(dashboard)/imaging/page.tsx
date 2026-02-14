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
  ClipboardList,
  Activity,
  BookOpen,
  CalendarDays,
  Image as ImageIcon,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ImagingOrderTable, ImagingWorklist, SchedulingCalendar, ModalityBadge } from '@/components/imaging';
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

export default function ImagingPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ImagingOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ImagingPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch } = useImagingOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });

  const orders = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Imaging</h1>
          <p className="text-muted-foreground hidden sm:block">
            Manage imaging orders, view worklist, and track procedures
          </p>
        </div>
        <Button
          onClick={() => router.push('/imaging/orders/new')}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Imaging Order
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="orders" className="gap-1.5 px-2 sm:px-4">
            <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
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
            totalPages={totalPages}
            onPageChange={setPage}
            onStatusFilter={setStatusFilter}
            onPriorityFilter={setPriorityFilter}
            onSearch={setSearchQuery}
            onRefresh={() => refetch()}
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
  const studies = data?.results?.filter((study: DICOMStudy) => {
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Studies Table */}
      <Card>
        <CardContent className="p-0 sm:p-4">
          {isLoading ? (
            <div className="p-4 space-y-3">
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
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No DICOM studies found</p>
            </div>
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
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
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {study.study_description || 'No description'}
                        </TableCell>
                        <TableCell>
                          <ModalityBadge modality={study.modality as ImagingModality} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(study.study_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {study.number_of_instances}
                        </TableCell>
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
              <div className="md:hidden space-y-3 p-4">
                {studies.map((study: DICOMStudy) => (
                  <div
                    key={study.study_instance_uid}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/imaging/studies/${study.study_instance_uid}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium truncate">
                        {study.patient_name || 'Unknown'}
                      </span>
                      <ModalityBadge modality={study.modality as ImagingModality} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {study.study_description || 'No description'}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{formatDate(study.study_date)}</span>
                      <span>{study.number_of_instances} images</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-4 border-t">
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
  
  const { data, isLoading } = useImagingProcedures({
    page,
    page_size: 50,
    modality: modalityFilter || undefined,
  });

  const procedures = data?.results || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">
          Procedure Catalog ({data?.count || 0} procedures)
        </h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))
        ) : (
          procedures.map((procedure: ImagingProcedure) => (
            <div
              key={procedure.id}
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {procedure.code}
                </span>
                <span className="text-xs px-2 py-0.5 bg-muted rounded">
                  {procedure.modality}
                </span>
              </div>
              <p className="font-medium">{procedure.name}</p>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span>KES {procedure.cost.toLocaleString()}</span>
                {procedure.sha_claimable && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    SHA Covered
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
