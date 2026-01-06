'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Play,
  CheckCircle2,
  Clock,
  User,
  MoreHorizontal,
  Beaker,
  AlertTriangle,
  RefreshCw,
  Syringe,
  Send,
  XCircle,
  FileText,
  UserPlus,
  Search,
  Timer,
} from 'lucide-react';
import { LabQueue, QueueStatus, LabPriority } from '@/lib/types/laboratory';
import {
  useLabQueue,
  useCollectSample,
  useStartProcessing,
  useSubmitForReview,
  useReleaseResults,
  useRejectSample,
  useUpdateNotes,
  useBarcodeLookup,
  useAssignQueueEntry,
  useLabTechnicians,
} from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { EmptyState } from '@/components/shared/empty-state';
import {
  SampleCollectionDialog,
  TechnicianAssignmentDialog,
  RejectSampleDialog,
  TechnicianNotesDialog,
  BarcodeSearchDialog,
} from './lab-queue-dialogs';

interface LabQueueViewProps {
  defaultStatus?: QueueStatus | '';
}

const STATUS_CONFIG: Record<QueueStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  PENDING: { label: 'Pending', variant: 'outline', icon: Clock },
  COLLECTED: { label: 'Collected', variant: 'secondary', icon: Beaker },
  PROCESSING: { label: 'Processing', variant: 'default', icon: Play },
  REVIEW: { label: 'Review', variant: 'secondary', icon: User },
  RELEASED: { label: 'Released', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; className: string }> = {
  ROUTINE: { label: 'Routine', className: 'text-muted-foreground' },
  URGENT: { label: 'Urgent', className: 'text-warning font-medium' },
  STAT: { label: 'STAT', className: 'text-destructive font-bold' },
};

const STATUS_FILTERS: { value: QueueStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COLLECTED', label: 'Collected' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function LabQueueView({ defaultStatus = '' }: LabQueueViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  // State
  const [statusFilter, setStatusFilter] = useState<QueueStatus | ''>(defaultStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Dialog states
  const [selectedQueueEntry, setSelectedQueueEntry] = useState<LabQueue | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [barcodeSearchOpen, setBarcodeSearchOpen] = useState(false);

  // Hooks
  const { data: queue, isLoading, error, refetch } = useLabQueue(statusFilter || undefined);
  const { data: technicians = [], isLoading: isTechniciansLoading } = useLabTechnicians();
  const collectSample = useCollectSample();
  const startProcessing = useStartProcessing();
  const submitForReview = useSubmitForReview();
  const releaseResults = useReleaseResults();
  const rejectSample = useRejectSample();
  const updateNotes = useUpdateNotes();
  const barcodeLookup = useBarcodeLookup();
  const assignTechnician = useAssignQueueEntry();

  // Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const openCollectDialog = (entry: LabQueue) => {
    setSelectedQueueEntry(entry);
    setCollectDialogOpen(true);
  };

  const openAssignDialog = (entry: LabQueue) => {
    setSelectedQueueEntry(entry);
    setAssignDialogOpen(true);
  };

  const openRejectDialog = (entry: LabQueue) => {
    setSelectedQueueEntry(entry);
    setRejectDialogOpen(true);
  };

  const openNotesDialog = (entry: LabQueue) => {
    setSelectedQueueEntry(entry);
    setNotesDialogOpen(true);
  };

  const handleCollectSample = async (sampleId: string) => {
    if (!selectedQueueEntry) return;
    try {
      await collectSample.mutateAsync({
        queueNumber: selectedQueueEntry.queue_number,
        sampleId,
      });
      toast({
        title: 'Sample collected',
        description: sampleId
          ? `Sample ${sampleId} has been collected.`
          : 'Sample has been marked as collected.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to collect sample',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleAssignTechnician = async (technicianId: number | null) => {
    if (!selectedQueueEntry) return;
    try {
      await assignTechnician.mutateAsync({
        queueNumber: selectedQueueEntry.queue_number,
        technicianId,
      });
      toast({
        title: technicianId ? 'Technician assigned' : 'Technician unassigned',
        description: technicianId
          ? 'Queue entry has been assigned.'
          : 'Queue entry has been unassigned.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign technician',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleRejectSample = async (reason: string) => {
    if (!selectedQueueEntry) return;
    try {
      await rejectSample.mutateAsync({
        queueNumber: selectedQueueEntry.queue_number,
        reason,
      });
      toast({
        title: 'Sample rejected',
        description: 'Sample has been marked as rejected.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject sample',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateNotes = async (notes: string, append: boolean) => {
    if (!selectedQueueEntry) return;
    try {
      await updateNotes.mutateAsync({
        queueNumber: selectedQueueEntry.queue_number,
        notes,
        append,
      });
      toast({
        title: 'Notes saved',
        description: 'Technician notes have been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save notes',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleBarcodeLookup = async (barcode: string): Promise<LabQueue | null> => {
    try {
      const result = await barcodeLookup.mutateAsync(barcode);
      return result;
    } catch {
      return null;
    }
  };

  const handleBarcodeSelect = (entry: LabQueue) => {
    // Navigate to the order or highlight the entry
    router.push(`/laboratory/orders/${entry.order_number}`);
  };

  const handleStartProcessing = async (queueNumber: string) => {
    try {
      await startProcessing.mutateAsync(queueNumber);
      toast({
        title: 'Processing started',
        description: 'Queue entry is now being processed.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start processing',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitForReview = async (queueNumber: string) => {
    try {
      await submitForReview.mutateAsync(queueNumber);
      toast({
        title: 'Submitted for review',
        description: 'Results have been submitted for review.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit for review',
        variant: 'destructive',
      });
    }
  };

  const handleReleaseResults = async (queueNumber: string) => {
    try {
      await releaseResults.mutateAsync(queueNumber);
      toast({
        title: 'Results released',
        description: 'Results have been released to the clinician.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to release results',
        variant: 'destructive',
      });
    }
  };

  // Filter queue by quick search
  const filteredQueue = (queue || []).filter((item) => {
    if (!quickSearch) return true;
    const search = quickSearch.toLowerCase();
    return (
      item.queue_number.toLowerCase().includes(search) ||
      item.patient_name?.toLowerCase().includes(search) ||
      item.patient_mrn?.toLowerCase().includes(search) ||
      item.sample_id?.toLowerCase().includes(search)
    );
  });

  // Count by status for summary cards
  const statusCounts = (queue || []).reduce((acc, item) => {
    acc[item.queue_status] = (acc[item.queue_status] || 0) + 1;
    return acc;
  }, {} as Record<QueueStatus, number>);

  // Count overdue items
  const overdueCount = (queue || []).filter((item) => item.is_overdue).length;

  if (error) {
    return (
      <EmptyState
        title="Error loading queue"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => refetch(),
        }}
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Status Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Object.entries(STATUS_CONFIG)
            .filter(([status]) => status !== 'REJECTED')
            .map(([status, config]) => {
              const StatusIcon = config.icon;
              const count = statusCounts[status as QueueStatus] || 0;

              return (
                <Card
                  key={status}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/50',
                    statusFilter === status && 'border-primary bg-primary/5'
                  )}
                  onClick={() =>
                    setStatusFilter(statusFilter === status ? '' : (status as QueueStatus))
                  }
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground">{config.label}</p>
                      </div>
                      <StatusIcon
                        className={cn(
                          'h-8 w-8 opacity-50',
                          config.variant === 'default' && 'text-green-500',
                          config.variant === 'secondary' && 'text-blue-500'
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

          {/* Overdue Card */}
          <Card
            className={cn(
              'cursor-pointer transition-colors hover:bg-muted/50',
              overdueCount > 0 && 'border-warning bg-warning/10'
            )}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{overdueCount}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
                <AlertTriangle
                  className={cn('h-8 w-8', overdueCount > 0 ? 'text-warning' : 'opacity-50')}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Queue Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle>Lab Queue</CardTitle>
                <CardDescription>{filteredQueue.length} items in queue</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Quick Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Quick search..."
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    className="pl-8 w-[180px]"
                  />
                </div>

                {/* Barcode Lookup Button */}
                <Button variant="outline" size="icon" onClick={() => setBarcodeSearchOpen(true)}>
                  <Syringe className="h-4 w-4" />
                </Button>

                {/* Status Filter */}
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as QueueStatus | '')}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Refresh Button */}
                <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !filteredQueue || filteredQueue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Beaker className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No items in queue</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Sample</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>TAT</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((item) => {
                    const status = STATUS_CONFIG[item.queue_status] || STATUS_CONFIG.PENDING;
                    const priority = PRIORITY_CONFIG[item.priority];
                    const StatusIcon = status.icon;
                    const isDropdownOpen = openDropdownId === item.queue_number;

                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50 transition-colors',
                          item.priority === 'STAT' && 'bg-destructive/10 hover:bg-destructive/20',
                          item.priority === 'URGENT' && 'bg-warning/10 hover:bg-warning/20',
                          item.is_overdue && 'bg-warning/20 hover:bg-warning/30'
                        )}
                        onClick={() => setOpenDropdownId(item.queue_number)}
                      >
                        <TableCell className="font-mono text-sm">{item.queue_number}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{item.sample_type}</p>
                            {item.sample_id && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {item.sample_id}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={priority.className}>{priority.label}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {item.assigned_technician_name || (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground h-auto p-1"
                              onClick={() => openAssignDialog(item)}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Assign
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <TATDisplay item={item} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu 
                            open={isDropdownOpen} 
                            onOpenChange={(open) => setOpenDropdownId(open ? item.queue_number : null)}
                          >
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => router.push(`/laboratory/orders/${item.order_number}`)}
                              >
                                View Order
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {/* PENDING -> COLLECTED: Collect Sample */}
                              {item.queue_status === 'PENDING' && (
                                <DropdownMenuItem onClick={() => openCollectDialog(item)}>
                                  <Syringe className="h-4 w-4 mr-2" />
                                  Collect Sample
                                </DropdownMenuItem>
                              )}

                              {/* COLLECTED -> PROCESSING: Start Processing */}
                              {item.queue_status === 'COLLECTED' && (
                                <DropdownMenuItem
                                  onClick={() => handleStartProcessing(item.queue_number)}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Start Processing
                                </DropdownMenuItem>
                              )}

                              {/* PROCESSING: Enter Results or Submit for Review */}
                              {item.queue_status === 'PROCESSING' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(`/laboratory/orders/${item.order_number}/results`)
                                    }
                                  >
                                    <Beaker className="h-4 w-4 mr-2" />
                                    Enter Results
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleSubmitForReview(item.queue_number)}
                                  >
                                    <Send className="h-4 w-4 mr-2" />
                                    Submit for Review
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* REVIEW -> RELEASED: Release Results */}
                              {item.queue_status === 'REVIEW' && (
                                <DropdownMenuItem
                                  onClick={() => handleReleaseResults(item.queue_number)}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Release Results
                                </DropdownMenuItem>
                              )}

                              {/* Notes - available for most statuses */}
                              {['COLLECTED', 'PROCESSING', 'REVIEW'].includes(item.queue_status) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openNotesDialog(item)}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    {item.technician_notes ? 'Edit Notes' : 'Add Notes'}
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Assign Technician */}
                              {['PENDING', 'COLLECTED', 'PROCESSING'].includes(item.queue_status) && (
                                <DropdownMenuItem onClick={() => openAssignDialog(item)}>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  {item.assigned_technician ? 'Reassign' : 'Assign Technician'}
                                </DropdownMenuItem>
                              )}

                              {/* Reject Sample - not for RELEASED or already REJECTED */}
                              {!['RELEASED', 'REJECTED'].includes(item.queue_status) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => openRejectDialog(item)}
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject Sample
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <SampleCollectionDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          queueEntry={selectedQueueEntry}
          onSubmit={handleCollectSample}
          isLoading={collectSample.isPending}
        />

        <TechnicianAssignmentDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          queueEntry={selectedQueueEntry}
          technicians={technicians}
          onSubmit={handleAssignTechnician}
          isLoading={assignTechnician.isPending}
          isTechniciansLoading={isTechniciansLoading}
        />

        <RejectSampleDialog
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          queueEntry={selectedQueueEntry}
          onSubmit={handleRejectSample}
          isLoading={rejectSample.isPending}
        />

        <TechnicianNotesDialog
          open={notesDialogOpen}
          onOpenChange={setNotesDialogOpen}
          queueEntry={selectedQueueEntry}
          onSubmit={handleUpdateNotes}
          isLoading={updateNotes.isPending}
        />

        <BarcodeSearchDialog
          open={barcodeSearchOpen}
          onOpenChange={setBarcodeSearchOpen}
          onSearch={handleBarcodeLookup}
          onSelect={handleBarcodeSelect}
          isLoading={barcodeLookup.isPending}
        />
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// TAT Display Component
// ============================================================================

interface TATDisplayProps {
  item: LabQueue;
}

function TATDisplay({ item }: TATDisplayProps) {
  const { expected_tat_hours, elapsed_hours, actual_tat_hours, is_overdue, queue_status } = item;

  // Released - show actual TAT
  if (queue_status === 'RELEASED' && actual_tat_hours !== undefined) {
    const isWithinExpected = actual_tat_hours <= (expected_tat_hours || 24);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('text-sm', isWithinExpected ? 'text-green-600' : 'text-orange-600')}>
            <div className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {actual_tat_hours.toFixed(1)}h
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Completed in {actual_tat_hours.toFixed(1)} hours</p>
          <p className="text-xs text-muted-foreground">Expected: {expected_tat_hours || 24}h</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // In progress - show elapsed vs expected
  if (elapsed_hours !== undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('text-sm', is_overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
            <div className="flex items-center gap-1">
              {is_overdue && <AlertTriangle className="h-3 w-3" />}
              <Timer className="h-3 w-3" />
              {elapsed_hours.toFixed(1)}h
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Elapsed: {elapsed_hours.toFixed(1)} hours</p>
          <p className="text-xs text-muted-foreground">Expected: {expected_tat_hours || 24}h</p>
          {is_overdue && <p className="text-xs text-red-500 font-medium">OVERDUE</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">{formatRelativeTime(item.created_at)}</span>
  );
}
