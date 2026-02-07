/**
 * Clinic Queue Management Page
 *
 * Dedicated queue management page with advanced filtering, search,
 * and bulk operations for clinic queue management.
 *
 * Route: /clinics/[clinicId]/queue
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Users,
  UserCheck,
  CheckCircle,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Play,
  Pause,
  AlertCircle,
  Phone,
  LayoutGrid,
  List,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ClinicQueueTable } from '@/components/clinics/clinic-queue-table';
import { ClinicVisitCard } from '@/components/clinics/clinic-visit-card';
import { AddToQueueDialog } from '@/components/clinics/add-to-queue-dialog';
import { ClinicPriorityBadge } from '@/components/clinics/clinic-priority-badge';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import {
  useClinic,
  useClinicQueue,
  useQueueStats,
  useTodaySession,
  useOpenSession,
  useCloseSession,
} from '@/lib/hooks/use-clinics';
import { useClinicQueueSocket } from '@/lib/hooks/use-websocket';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisit, ClinicVisitPriority, ClinicVisitStatus } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

type ViewMode = 'table' | 'cards';

export default function ClinicQueuePage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = Number(params.clinicId);

  // UI State
  const [addToQueueOpen, setAddToQueueOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<ClinicVisitPriority | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<ClinicVisitStatus | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Fetch clinic data
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: session, refetch: refetchSession } = useTodaySession(clinicId);
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useClinicQueue(clinicId);
  const { data: stats, refetch: refetchStats } = useQueueStats(clinicId);

  // WebSocket for real-time queue updates
  const { connectionState, reconnectAttempts } = useClinicQueueSocket(clinicId);

  // Mutations
  const { mutateAsync: openSession, isPending: openingSession } = useOpenSession();
  const { mutateAsync: closeSession, isPending: closingSession } = useCloseSession();

  // Filter and search logic
  const filteredQueue = useMemo(() => {
    let result = queue ?? [];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.patient.full_name.toLowerCase().includes(query) ||
          v.patient.mrn.toLowerCase().includes(query) ||
          v.queue_number.toString().includes(query)
      );
    }

    // Apply priority filter
    if (priorityFilter !== 'ALL') {
      result = result.filter((v) => v.priority === priorityFilter);
    }

    // Apply status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((v) => v.status === statusFilter);
    }

    // Sort by priority then by registered_at
    return result.sort((a, b) => {
      const priorityOrder = { EMERGENCY: 1, URGENT: 2, PRIORITY: 3, STANDARD: 4, NON_URGENT: 5 };
      const aPriority = priorityOrder[a.priority] || 5;
      const bPriority = priorityOrder[b.priority] || 5;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime();
    });
  }, [queue, searchQuery, priorityFilter, statusFilter]);

  // Queue by status
  const waitingQueue = useMemo(
    () => filteredQueue.filter((v) => v.status === 'REGISTERED' || v.status === 'WAITING' || v.status === 'CALLED'),
    [filteredQueue]
  );

  const inConsultation = useMemo(
    () => filteredQueue.filter((v) => v.status === 'IN_CONSULTATION'),
    [filteredQueue]
  );

  const completedToday = useMemo(
    () => filteredQueue.filter((v) => v.status === 'COMPLETED'),
    [filteredQueue]
  );

  // Handle session actions
  const handleOpenSession = async () => {
    try {
      await openSession(clinicId);
      toast({ title: 'Session Opened', description: 'The clinic session is now open.' });
      refetchSession();
      refetchQueue();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to open session. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCloseSession = async () => {
    try {
      await closeSession(clinicId);
      toast({ title: 'Session Closed', description: 'The clinic session has been closed.' });
      refetchSession();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to close session. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = useCallback(() => {
    refetchQueue();
    refetchStats();
    refetchSession();
  }, [refetchQueue, refetchStats, refetchSession]);

  const clearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('ALL');
    setStatusFilter('ALL');
  };

  if (clinicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  const isSessionOpen = session?.status === 'OPEN';
  const hasActiveFilters = searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clinics/${clinicId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {clinic.name} - Queue Management
            </h1>
            <p className="text-muted-foreground">
              Manage patient queue, call patients, and track consultations
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
          {/* WebSocket Status */}
          <WebSocketStatus
            connectionState={connectionState}
            reconnectAttempts={reconnectAttempts}
            showLabel
            size="sm"
          />

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          {isSessionOpen ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={closingSession}>
                  <Pause className="h-4 w-4 mr-2" />
                  Close Session
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close Today&apos;s Session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close the clinic session for today. Patients still in queue will remain
                    but no new patients can be added.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCloseSession}>Close Session</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button onClick={handleOpenSession} disabled={openingSession}>
              <Play className="h-4 w-4 mr-2" />
              Open Session
            </Button>
          )}

          <Button onClick={() => setAddToQueueOpen(true)} disabled={!isSessionOpen}>
            <Plus className="h-4 w-4 mr-2" />
            Add Patient
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Session Status Banner */}
      {!isSessionOpen && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div className="flex-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Session Not Open
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Open the session to start accepting patients for today&apos;s clinic.
              </p>
            </div>
            <Button onClick={handleOpenSession} disabled={openingSession}>
              Open Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waiting</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waitingQueue.length}</div>
            <p className="text-xs text-muted-foreground">Patients in queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Consultation</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inConsultation.length}</div>
            <p className="text-xs text-muted-foreground">Currently being seen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedToday.length}</div>
            <p className="text-xs text-muted-foreground">Seen today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Wait Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avg_wait_time_minutes ? `${Math.round(stats.avg_wait_time_minutes)} min` : '--'}
            </div>
            <p className="text-xs text-muted-foreground">Average wait</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, MRN, or queue number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as ClinicVisitPriority | 'ALL')}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Priorities</SelectItem>
                <SelectItem value="EMERGENCY">Emergency</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="PRIORITY">Priority</SelectItem>
                <SelectItem value="STANDARD">Standard</SelectItem>
                <SelectItem value="NON_URGENT">Non-Urgent</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ClinicVisitStatus | 'ALL')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="WAITING">Waiting</SelectItem>
                <SelectItem value="CALLED">Called</SelectItem>
                <SelectItem value="IN_CONSULTATION">In Consultation</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="NO_SHOW">No Show</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}

            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="rounded-r-none"
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="rounded-l-none"
                aria-label="Cards view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Content */}
      <Tabs defaultValue="waiting" className="space-y-4">
        <TabsList>
          <TabsTrigger value="waiting">
            Waiting
            {waitingQueue.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {waitingQueue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="consultation">
            In Consultation
            {inConsultation.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {inConsultation.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed
            {completedToday.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {completedToday.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {filteredQueue.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="space-y-4">
          {queueLoading ? (
            <Skeleton className="h-96" />
          ) : waitingQueue.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No patients waiting</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {hasActiveFilters
                    ? 'No patients match your filters.'
                    : 'Add a patient to the queue to get started.'}
                </p>
                {hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => setAddToQueueOpen(true)} disabled={!isSessionOpen}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Patient
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : viewMode === 'table' ? (
            <ClinicQueueTable visits={waitingQueue} clinicId={clinicId} onRefresh={handleRefresh} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {waitingQueue.map((visit) => (
                <ClinicVisitCard key={visit.id} visit={visit} clinicId={clinicId} onRefresh={handleRefresh} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="consultation" className="space-y-4">
          {inConsultation.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No active consultations</h3>
                <p className="text-muted-foreground text-center">
                  Call a patient from the queue to start a consultation.
                </p>
              </CardContent>
            </Card>
          ) : viewMode === 'table' ? (
            <ClinicQueueTable visits={inConsultation} clinicId={clinicId} onRefresh={handleRefresh} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {inConsultation.map((visit) => (
                <ClinicVisitCard key={visit.id} visit={visit} clinicId={clinicId} onRefresh={handleRefresh} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedToday.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No completed visits today</h3>
                <p className="text-muted-foreground text-center">
                  Completed consultations will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ClinicQueueTable
              visits={completedToday}
              clinicId={clinicId}
              onRefresh={handleRefresh}
              showActions={false}
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {filteredQueue.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No visits found</h3>
                <p className="text-muted-foreground text-center">
                  {hasActiveFilters ? 'No visits match your filters.' : 'No visits recorded today.'}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === 'table' ? (
            <ClinicQueueTable visits={filteredQueue} clinicId={clinicId} onRefresh={handleRefresh} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredQueue.map((visit) => (
                <ClinicVisitCard key={visit.id} visit={visit} clinicId={clinicId} onRefresh={handleRefresh} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add to Queue Dialog */}
      <AddToQueueDialog
        open={addToQueueOpen}
        onOpenChange={setAddToQueueOpen}
        clinicId={clinicId}
        onSuccess={() => {
          handleRefresh();
          setAddToQueueOpen(false);
        }}
      />
    </div>
  );
}
