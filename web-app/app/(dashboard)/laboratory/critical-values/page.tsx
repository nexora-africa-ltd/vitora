'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  ShieldAlert,
  TrendingUp,
  Zap,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { criticalValuesApi } from '@/lib/api/critical-values';
import { laboratoryApi } from '@/lib/api/laboratory';
import type {
  CriticalValueNotification,
  CriticalValueRange,
  CriticalValueRangeCreateData,
  CriticalValueCompliance,
  CriticalNotificationMethod,
} from '@/lib/types/critical-values';
import type { TestCatalogListItem } from '@/lib/types/laboratory';
import { toast } from 'sonner';

// =============================================================================
// Helpers
// =============================================================================

function statusColor(status: string) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'NOTIFIED':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'READ_BACK':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'ACKNOWLEDGED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'ESCALATED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'FAILED':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function severityColor(severity: string) {
  return severity === 'PANIC'
    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Page Component
// =============================================================================

export default function CriticalValuesPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<CriticalValueNotification | null>(null);
  const [notifyMethod, setNotifyMethod] = useState<CriticalNotificationMethod>('PHONE_CALL');
  const [notifyToName, setNotifyToName] = useState('');
  const [readBackValue, setReadBackValue] = useState('');
  const [showRangeDialog, setShowRangeDialog] = useState(false);
  const [editingRange, setEditingRange] = useState<CriticalValueRange | null>(null);

  // Queries
  const { data: notificationsData } = useQuery({
    queryKey: ['critical-notifications'],
    queryFn: () => criticalValuesApi.listNotifications(),
  });

  const { data: rangesData } = useQuery({
    queryKey: ['critical-ranges'],
    queryFn: () => criticalValuesApi.listRanges(),
  });

  const { data: compliance } = useQuery({
    queryKey: ['critical-compliance'],
    queryFn: () => criticalValuesApi.getCompliance(),
  });

  const { data: testsData } = useQuery({
    queryKey: ['lab-tests-for-critical'],
    queryFn: () => laboratoryApi.listTests({ page_size: 200 }),
  });

  // Mutations
  const notifyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { method: CriticalNotificationMethod; notified_to_name: string } }) =>
      criticalValuesApi.notify(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['critical-compliance'] });
      setShowNotifyDialog(false);
      setSelectedNotification(null);
      toast.success('Clinician notified');
    },
  });

  const readBackMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) =>
      criticalValuesApi.readBack(id, { read_back_value: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-notifications'] });
      setReadBackValue('');
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => criticalValuesApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['critical-compliance'] });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => criticalValuesApi.seedDefaults(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['critical-ranges'] });
      toast.success(data.message);
    },
  });

  const createRangeMutation = useMutation({
    mutationFn: (data: CriticalValueRangeCreateData) => criticalValuesApi.createRange(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-ranges'] });
      setShowRangeDialog(false);
      toast.success('Critical value range created');
    },
    onError: () => toast.error('Failed to create range'),
  });

  const updateRangeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CriticalValueRangeCreateData> }) =>
      criticalValuesApi.updateRange(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-ranges'] });
      setShowRangeDialog(false);
      setEditingRange(null);
      toast.success('Critical value range updated');
    },
    onError: () => toast.error('Failed to update range'),
  });

  const deleteRangeMutation = useMutation({
    mutationFn: (id: number) => criticalValuesApi.deleteRange(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-ranges'] });
      toast.success('Critical value range deleted');
    },
    onError: () => toast.error('Failed to delete range'),
  });

  const notifications = notificationsData?.results || [];
  const ranges = rangesData?.results || [];
  const tests = testsData?.results || [];

  // Stats
  const pendingCount = compliance?.pending_count || 0;
  const overdueCount = compliance?.overdue_count || 0;
  const complianceRate = compliance?.compliance_rate || 0;
  const avgMinutes = compliance?.average_notification_minutes || 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Critical Values"
          helpContent="Track and manage critical/panic lab value notifications. Ensures timely clinician notification per ISO 15189 and CLIA requirements. Compliance target: >95% notified within 30 minutes."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Overdue</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-red-600">{overdueCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Compliance</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{complianceRate.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Time</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{avgMinutes.toFixed(0)} min</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="notifications">
          <TabsList>
            <TabsTrigger value="notifications" className="gap-2">
              <BellRing className="h-4 w-4" />
              <span className="sm:hidden">Alerts</span>
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="ranges" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Ranges
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="mt-4">
            <ResponsiveTable
              data={notifications}
              keyExtractor={(item) => item.id}
              defaultSortColumn="detected_at"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'test_name',
                  header: 'Test',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p className="font-medium">{item.test_name}</p>
                      <p className="text-xs font-mono text-destructive font-bold">
                        {item.critical_value}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'patient_name',
                  header: 'Patient',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p>{item.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
                    </div>
                  ),
                },
                {
                  key: 'severity',
                  header: 'Severity',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${severityColor(item.severity)} shrink-0 w-fit`}>
                      {item.severity}
                    </Badge>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <div className="flex items-center gap-1">
                      <Badge className={`${statusColor(item.status)} shrink-0 w-fit`}>
                        {item.status.replace('_', ' ')}
                      </Badge>
                      {item.is_overdue && (
                        <Badge className="bg-red-600 text-white shrink-0 w-fit text-[10px]">
                          OVERDUE
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'detected_at',
                  header: 'Detected',
                  sortable: true,
                  sortType: 'date',
                  cell: (item) => formatDate(item.detected_at),
                  hideOnMobile: true,
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => {
                    if (item.status === 'PENDING') {
                      return (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNotification(item);
                            setShowNotifyDialog(true);
                          }}
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          Notify
                        </Button>
                      );
                    }
                    if (item.status === 'NOTIFIED' || item.status === 'READ_BACK') {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeMutation.mutate(item.id);
                          }}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Ack
                        </Button>
                      );
                    }
                    return null;
                  },
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.test_name}</p>
                      <p className="text-xs font-mono text-destructive font-bold">
                        {item.critical_value}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className={`${severityColor(item.severity)} shrink-0 w-fit`}>
                        {item.severity}
                      </Badge>
                      {item.is_overdue && (
                        <Badge className="bg-red-600 text-white shrink-0 w-fit text-[10px]">
                          !
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {item.patient_name}
                    </span>
                    <Badge className={`${statusColor(item.status)} shrink-0 w-fit`}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {item.status === 'PENDING' && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedNotification(item);
                        setShowNotifyDialog(true);
                      }}
                    >
                      <Phone className="mr-1 h-3.5 w-3.5" />
                      Notify Clinician
                    </Button>
                  )}
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="ranges" className="mt-4">
            <div className="mb-4 flex justify-end gap-2">
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                variant="outline"
                size="sm"
              >
                <Zap className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}</span>
                <span className="sm:hidden">Seed</span>
              </Button>
              <Button
                size="sm"
                onClick={() => { setEditingRange(null); setShowRangeDialog(true); }}
              >
                <Plus className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Add Range</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
            <ResponsiveTable
              data={ranges}
              keyExtractor={(item) => item.id}
              columns={[
                {
                  key: 'test_name',
                  header: 'Test',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p className="font-medium">{item.test_name}</p>
                      <p className="text-xs text-muted-foreground">{item.test_code}</p>
                    </div>
                  ),
                },
                {
                  key: 'critical_low',
                  header: 'Critical Low',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.critical_low ?? '—',
                },
                {
                  key: 'critical_high',
                  header: 'Critical High',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.critical_high ?? '—',
                },
                {
                  key: 'panic_low',
                  header: 'Panic Low',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.panic_low ?? '—',
                  hideOnMobile: true,
                },
                {
                  key: 'panic_high',
                  header: 'Panic High',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.panic_high ?? '—',
                  hideOnMobile: true,
                },
                {
                  key: 'notification_deadline_minutes',
                  header: 'Deadline',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => `${item.notification_deadline_minutes} min`,
                  hideOnMobile: true,
                },
                {
                  key: 'is_active',
                  header: 'Active',
                  sortable: true,
                  cell: (item) => (
                    <Badge
                      className={
                        item.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                      }
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setEditingRange(item); setShowRangeDialog(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete critical value range?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the critical value range for &quot;{item.test_name}&quot;.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteRangeMutation.mutate(item.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ),
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.test_name}</p>
                      <p className="text-xs text-muted-foreground">{item.test_code}</p>
                    </div>
                    <Badge
                      className={
                        item.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                      }
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Critical: {item.critical_low ?? '—'} – {item.critical_high ?? '—'} |
                    Panic: {item.panic_low ?? '—'} – {item.panic_high ?? '—'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Deadline: {item.notification_deadline_minutes} min
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => { setEditingRange(item); setShowRangeDialog(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive"
                        onClick={() => deleteRangeMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            />
          </TabsContent>
        </Tabs>

        {/* Notify Dialog */}
        <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Notify Clinician</DialogTitle>
            </DialogHeader>
            {selectedNotification && (
              <div className="space-y-4">
                <div className="rounded-lg bg-destructive/10 p-3">
                  <p className="font-medium text-destructive">
                    {selectedNotification.test_name}: {selectedNotification.critical_value}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Patient: {selectedNotification.patient_name} ({selectedNotification.patient_mrn})
                  </p>
                </div>
                <div>
                  <Label htmlFor="notify-method">Notification Method</Label>
                  <Select
                    value={notifyMethod}
                    onValueChange={(v) => setNotifyMethod(v as CriticalNotificationMethod)}
                  >
                    <SelectTrigger id="notify-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHONE_CALL">Phone Call</SelectItem>
                      <SelectItem value="IN_PERSON">In Person</SelectItem>
                      <SelectItem value="SECURE_MESSAGE">Secure Message</SelectItem>
                      <SelectItem value="PAGER">Pager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notify-to">Notified To (name)</Label>
                  <Input
                    id="notify-to"
                    value={notifyToName}
                    onChange={(e) => setNotifyToName(e.target.value)}
                    placeholder="Dr. Name"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNotifyDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedNotification) {
                    notifyMutation.mutate({
                      id: selectedNotification.id,
                      data: { method: notifyMethod, notified_to_name: notifyToName },
                    });
                  }
                }}
                disabled={notifyMutation.isPending}
              >
                {notifyMutation.isPending ? 'Recording...' : 'Record Notification'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Critical Value Range Dialog */}
        <CriticalValueRangeDialog
          open={showRangeDialog}
          onOpenChange={(open) => { setShowRangeDialog(open); if (!open) setEditingRange(null); }}
          editingRange={editingRange}
          tests={tests}
          onSubmit={(data) => {
            if (editingRange) {
              updateRangeMutation.mutate({ id: editingRange.id, data });
            } else {
              createRangeMutation.mutate(data as CriticalValueRangeCreateData);
            }
          }}
          isPending={createRangeMutation.isPending || updateRangeMutation.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

// --- Range Dialog Component ---

function CriticalValueRangeDialog({
  open,
  onOpenChange,
  editingRange,
  tests,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRange: CriticalValueRange | null;
  tests: TestCatalogListItem[];
  onSubmit: (data: Partial<CriticalValueRangeCreateData> & { is_active?: boolean }) => void;
  isPending: boolean;
}) {
  const [testId, setTestId] = useState<string>('');
  const [criticalLow, setCriticalLow] = useState('');
  const [criticalHigh, setCriticalHigh] = useState('');
  const [panicLow, setPanicLow] = useState('');
  const [panicHigh, setPanicHigh] = useState('');
  const [deadline, setDeadline] = useState('30');
  const [unit, setUnit] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Reset form when dialog opens/editingRange changes
  const resetForm = () => {
    if (editingRange) {
      setTestId(String(editingRange.test));
      setCriticalLow(editingRange.critical_low != null ? String(editingRange.critical_low) : '');
      setCriticalHigh(editingRange.critical_high != null ? String(editingRange.critical_high) : '');
      setPanicLow(editingRange.panic_low != null ? String(editingRange.panic_low) : '');
      setPanicHigh(editingRange.panic_high != null ? String(editingRange.panic_high) : '');
      setDeadline(String(editingRange.notification_deadline_minutes));
      setUnit(editingRange.unit || '');
      setIsActive(editingRange.is_active);
    } else {
      setTestId('');
      setCriticalLow('');
      setCriticalHigh('');
      setPanicLow('');
      setPanicHigh('');
      setDeadline('30');
      setUnit('');
      setIsActive(true);
    }
  };

  // Reset on open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleOpenChange = (val: boolean) => {
    if (val) resetForm();
    onOpenChange(val);
  };

  // Also reset when editingRange changes while dialog is open
  if (open && editingRange && testId === '' && editingRange.test) {
    resetForm();
  }

  const handleSubmit = () => {
    const data: Partial<CriticalValueRangeCreateData> & { is_active?: boolean } = {};
    if (!editingRange) {
      if (!testId) return;
      data.test = Number(testId);
    }
    if (criticalLow) data.critical_low = Number(criticalLow);
    if (criticalHigh) data.critical_high = Number(criticalHigh);
    if (panicLow) data.panic_low = Number(panicLow);
    if (panicHigh) data.panic_high = Number(panicHigh);
    if (deadline) data.notification_deadline_minutes = Number(deadline);
    if (unit) data.unit = unit;
    if (editingRange) data.is_active = isActive;
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingRange ? 'Edit Critical Value Range' : 'Add Critical Value Range'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!editingRange && (
            <div>
              <Label>Test</Label>
              <Select value={testId} onValueChange={setTestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a test" />
                </SelectTrigger>
                <SelectContent>
                  {tests.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} ({t.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Critical Low</Label>
              <Input
                type="number"
                value={criticalLow}
                onChange={(e) => setCriticalLow(e.target.value)}
                placeholder="e.g. 3.0"
              />
            </div>
            <div>
              <Label>Critical High</Label>
              <Input
                type="number"
                value={criticalHigh}
                onChange={(e) => setCriticalHigh(e.target.value)}
                placeholder="e.g. 6.5"
              />
            </div>
            <div>
              <Label>Panic Low</Label>
              <Input
                type="number"
                value={panicLow}
                onChange={(e) => setPanicLow(e.target.value)}
                placeholder="e.g. 2.0"
              />
            </div>
            <div>
              <Label>Panic High</Label>
              <Input
                type="number"
                value={panicHigh}
                onChange={(e) => setPanicHigh(e.target.value)}
                placeholder="e.g. 8.0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Notification Deadline (min)</Label>
              <Input
                type="number"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="30"
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. mmol/L"
              />
            </div>
          </div>
          {editingRange && (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{isActive ? 'Active' : 'Inactive'}</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || (!editingRange && !testId)}>
            {isPending ? 'Saving...' : editingRange ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
