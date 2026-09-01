/**
 * Alerts Panel Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import {
  AlertTriangle,
  XCircle,
  Clock,
  CheckCircle,
  Package,
  Bell,
  Loader2,
  RefreshCw,
  Settings,
  ShoppingCart,
  Eye,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { StockAlert, AlertType, AlertSeverity } from '@/lib/types/pharmacy';
import {
  useAcknowledgeAlert,
  useResolveAlert,
  useAlertSettings,
  useUpdateAlertSettings,
} from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { pharmacyApi } from '@/lib/api/pharmacy';

interface AlertsPanelProps {
  alerts: StockAlert[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onRefresh?: () => void;
  autoRefreshInterval?: number; // in seconds, 0 to disable
}

// Alert type icons
const ALERT_TYPE_ICONS: Record<AlertType, typeof AlertTriangle> = {
  LOW_STOCK: AlertTriangle,
  OUT_OF_STOCK: XCircle,
  EXPIRING_SOON: Clock,
  EXPIRING_CRITICAL: Clock,
  EXPIRED: XCircle,
  RECALLED: Bell,
  RX_EXPIRING: Clock,
};

// Severity badge colors
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

const SEVERITY_PANEL_COLORS: Record<AlertSeverity, string> = {
  LOW: 'border-blue-400/60 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/20',
  MEDIUM: 'border-yellow-400/60 bg-yellow-50/60 dark:border-yellow-700 dark:bg-yellow-950/20',
  HIGH: 'border-orange-400/60 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-950/20',
  CRITICAL: 'border-red-400/60 bg-red-50/60 dark:border-red-700 dark:bg-red-950/20',
};

const SEVERITY_ICON_BG: Record<AlertSeverity, string> = {
  LOW: 'bg-blue-100 dark:bg-blue-900/40',
  MEDIUM: 'bg-yellow-100 dark:bg-yellow-900/40',
  HIGH: 'bg-orange-100 dark:bg-orange-900/40',
  CRITICAL: 'bg-red-100 dark:bg-red-900/40',
};

const SEVERITY_ICON_FG: Record<AlertSeverity, string> = {
  LOW: 'text-blue-600 dark:text-blue-300',
  MEDIUM: 'text-yellow-600 dark:text-yellow-300',
  HIGH: 'text-orange-600 dark:text-orange-300',
  CRITICAL: 'text-red-600 dark:text-red-300',
};

// Alert type test id
const ALERT_TYPE_TEST_IDS: Record<AlertType, string> = {
  LOW_STOCK: 'alert-icon-low-stock',
  OUT_OF_STOCK: 'alert-icon-out-of-stock',
  EXPIRING_SOON: 'alert-icon-expiring-soon',
  EXPIRING_CRITICAL: 'alert-icon-expiring-critical',
  EXPIRED: 'alert-icon-expired',
  RECALLED: 'alert-icon-recalled',
  RX_EXPIRING: 'alert-icon-rx-expiring',
};

export function AlertsPanel({
  alerts,
  isLoading,
  error,
  page,
  totalPages,
  totalCount,
  onPageChange,
  onRefresh,
  autoRefreshInterval = 0, // Default: no auto-refresh
}: AlertsPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<StockAlert | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [expiryWarningDays, setExpiryWarningDays] = useState('90');
  const [lowStockThreshold, setLowStockThreshold] = useState('100');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const isDefaultFilterView =
    activeTab === 'all' && !showResolved && typeFilter === 'all' && severityFilter === 'all';

  const acknowledgeAlert = useAcknowledgeAlert();
  const resolveAlert = useResolveAlert();
  const { data: alertSettings } = useAlertSettings();
  const updateSettings = useUpdateAlertSettings();

  // Load settings when available
  useEffect(() => {
    if (alertSettings) {
      setExpiryWarningDays(String(alertSettings.expiry_warning_days || 90));
      setLowStockThreshold(String(alertSettings.low_stock_threshold || 100));
    }
  }, [alertSettings]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefreshInterval > 0 && onRefresh) {
      const intervalId = setInterval(() => {
        onRefresh();
        setLastRefreshed(new Date());
      }, autoRefreshInterval * 1000);

      return () => clearInterval(intervalId);
    }
    return undefined;
  }, [autoRefreshInterval, onRefresh]);

  // Filter alerts based on active tab, filters, and resolved state
  const matchesCurrentFilters = (alert: StockAlert): boolean => {
    // Resolved filter
    if (!showResolved && alert.resolved) return false;

    // Type filter
    if (typeFilter !== 'all' && alert.alert_type !== typeFilter) return false;

    // Severity filter
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;

    // Tab filter
    if (activeTab === 'all') return true;
    if (activeTab === 'low-stock') {
      return alert.alert_type === 'LOW_STOCK' || alert.alert_type === 'OUT_OF_STOCK';
    }
    if (activeTab === 'expiring') {
      return (
        alert.alert_type === 'EXPIRING_SOON' ||
        alert.alert_type === 'EXPIRING_CRITICAL' ||
        alert.alert_type === 'EXPIRED'
      );
    }
    return true;
  };

  const filteredAlerts = alerts.filter(matchesCurrentFilters);

  // Handle acknowledge
  const handleAcknowledge = async (alertId: number) => {
    try {
      await acknowledgeAlert.mutateAsync(alertId);
      toast({
        title: 'Alert acknowledged',
        description: 'The alert has been acknowledged successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to acknowledge alert.',
        variant: 'destructive',
      });
    }
  };

  // Handle resolve
  const handleResolve = async () => {
    if (!selectedAlert) return;
    try {
      await resolveAlert.mutateAsync({ id: selectedAlert.id, notes: resolutionNotes });
      toast({
        title: 'Alert resolved',
        description: 'The alert has been resolved successfully.',
      });
      setResolveDialogOpen(false);
      setResolutionNotes('');
      setSelectedAlert(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resolve alert.',
        variant: 'destructive',
      });
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
        setLastRefreshed(new Date());
        toast({
          title: 'Alerts refreshed',
          description: 'Successfully refreshed alerts data.',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to refresh alerts.',
          variant: 'destructive',
        });
      } finally {
        setIsRefreshing(false);
      }
    } else {
      toast({
        title: 'Refreshing alerts',
        description: 'Alerts are being refreshed...',
      });
    }
  };

  // Export alerts to CSV
  const handleExport = () => {
    const run = async () => {
      setIsExporting(true);
      try {
        const pageSize = 200;
        const allAlerts: StockAlert[] = [];
        let pageNum = 1;
        let total = 0;

        do {
          const response = await pharmacyApi.listAlerts({
            page: pageNum,
            page_size: pageSize,
            resolved: showResolved ? undefined : false,
          });
          total = response.count;
          allAlerts.push(...response.results);
          pageNum += 1;
        } while (allAlerts.length < total);

        const exportAlerts = allAlerts.filter(matchesCurrentFilters);

        // Create CSV content
        const headers = [
          'Item Name',
          'Item Code',
          'Alert Type',
          'Severity',
          'Message',
          'Batch Number',
          'Created At',
          'Acknowledged',
          'Resolved',
        ];
        const rows = exportAlerts.map((alert) => [
          alert.drug_name || '',
          alert.drug_code || '',
          alert.alert_type,
          alert.severity,
          alert.message,
          alert.batch_number || '',
          formatDateTime(alert.created_at, 'yyyy-MM-dd HH:mm:ss'),
          alert.acknowledged ? 'Yes' : 'No',
          alert.resolved ? 'Yes' : 'No',
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute(
          'download',
          `stock-alerts-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: 'Export successful',
          description: `Exported ${exportAlerts.length} alerts to CSV.`,
        });
      } catch (error) {
        toast({
          title: 'Export failed',
          description: 'Failed to export alerts.',
          variant: 'destructive',
        });
      } finally {
        setIsExporting(false);
      }
    };

    void run();
  };

  if (isLoading) {
    return (
      <div data-testid="alerts-loading" className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <XCircle className="mb-4 h-12 w-12 text-destructive" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (totalCount === 0 && alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle className="mb-4 h-12 w-12 text-green-500" />
        <p className="text-muted-foreground">No active alerts</p>
        <p className="mt-1 text-sm text-muted-foreground">
          All stock levels are within normal range
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Label htmlFor="type-filter">Type</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as AlertType | 'all')}
            >
              <SelectTrigger id="type-filter" data-testid="alert-type-filter" className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="OUT_OF_STOCK">OOS</SelectItem>
                <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                <SelectItem value="EXPIRING_SOON">Expiring Soon</SelectItem>
                <SelectItem value="EXPIRING_CRITICAL">Expiring Critical</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="RECALLED">Recalled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Severity filter */}
          <div className="flex items-center gap-2">
            <Label htmlFor="severity-filter">Severity</Label>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as AlertSeverity | 'all')}
            >
              <SelectTrigger
                id="severity-filter"
                data-testid="severity-filter"
                className="w-[150px]"
              >
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show resolved toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="resolved-toggle"
              data-testid="resolved-toggle"
              checked={showResolved}
              onCheckedChange={setShowResolved}
            />
            <Label htmlFor="resolved-toggle">Show Resolved</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Export button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="export-alerts-button"
            onClick={handleExport}
            disabled={totalCount === 0 || isExporting}
          >
            {isExporting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>

          {/* Quick filters */}
          <Button
            variant={activeTab === 'low-stock' ? 'default' : 'outline'}
            size="sm"
            data-testid="low-stock-filter"
            onClick={() => setActiveTab('low-stock')}
          >
            Low Stock
          </Button>
          <Button
            variant={activeTab === 'expiring' ? 'default' : 'outline'}
            size="sm"
            data-testid="expiring-filter"
            onClick={() => setActiveTab('expiring')}
          >
            Expiring
          </Button>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="refresh-alerts-button"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Settings button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="alert-settings-button"
            onClick={() => setSettingsDialogOpen(true)}
          >
            <Settings className="mr-1 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Last updated */}
      <p className="text-sm text-muted-foreground">
        Last refreshed: {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
          <TabsTrigger value="expiring">Expiring</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="space-y-4" data-testid="alert-list">
            {filteredAlerts.map((alert) => {
              const Icon = ALERT_TYPE_ICONS[alert.alert_type];
              const testId = ALERT_TYPE_TEST_IDS[alert.alert_type];

              return (
                <Card
                  key={alert.id}
                  data-testid="alert-item"
                  className={SEVERITY_PANEL_COLORS[alert.severity]}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        data-testid={testId}
                        className={`rounded-full p-2 ${SEVERITY_ICON_BG[alert.severity]}`}
                      >
                        <Icon className={`h-5 w-5 ${SEVERITY_ICON_FG[alert.severity]}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {alert.drug ? (
                              <Link
                                href={`/pharmacy/drugs/${alert.drug}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {alert.drug_name}
                              </Link>
                            ) : (
                              <span className="font-medium">{alert.drug_name}</span>
                            )}
                            <Badge className={SEVERITY_COLORS[alert.severity]}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(alert.created_at)}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground">{alert.message}</p>

                        {/* Status badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Auto-generated badge - all stock alerts are system generated */}
                          <Badge variant="outline" className="text-xs">
                            System Generated
                          </Badge>
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Acknowledged by {alert.acknowledged_by_name} on{' '}
                              {alert.acknowledged_at && formatDate(alert.acknowledged_at, 'MMM d')}
                            </Badge>
                          )}
                          {alert.batch_number && alert.stock_batch && (
                            <Link href={`/pharmacy?tab=inventory&batch=${alert.stock_batch}`}>
                              <Badge
                                variant="outline"
                                className="cursor-pointer text-xs hover:bg-accent"
                              >
                                <Package className="mr-1 h-3 w-3" />
                                {alert.batch_number}
                              </Badge>
                            </Link>
                          )}
                          {alert.batch_number && !alert.stock_batch && (
                            <Badge variant="outline" className="text-xs">
                              <Package className="mr-1 h-3 w-3" />
                              {alert.batch_number}
                            </Badge>
                          )}
                          {alert.resolved && (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-xs dark:bg-green-950/30"
                            >
                              <CheckCircle className="mr-1 h-3 w-3 text-green-600 dark:text-green-300" />
                              Resolved
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {!alert.acknowledged && !alert.resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="acknowledge-button"
                              onClick={() => handleAcknowledge(alert.id)}
                              disabled={acknowledgeAlert.isPending}
                            >
                              {acknowledgeAlert.isPending ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="mr-1 h-4 w-4" />
                              )}
                              Acknowledge
                            </Button>
                          )}
                          {!alert.resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="resolve-button"
                              onClick={() => {
                                setSelectedAlert(alert);
                                setResolveDialogOpen(true);
                              }}
                              disabled={resolveAlert.isPending}
                            >
                              {resolveAlert.isPending ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="mr-1 h-4 w-4" />
                              )}
                              Resolve
                            </Button>
                          )}
                          {(alert.alert_type === 'LOW_STOCK' ||
                            alert.alert_type === 'OUT_OF_STOCK') && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="reorder-button"
                              onClick={() => {
                                // Navigate to reorder page or open reorder dialog
                                toast({
                                  title: 'Reorder',
                                  description: `Opening reorder for ${alert.drug_name}`,
                                });
                              }}
                            >
                              <ShoppingCart className="mr-1 h-4 w-4" />
                              Reorder
                            </Button>
                          )}
                          {(alert.alert_type === 'EXPIRING_SOON' ||
                            alert.alert_type === 'EXPIRING_CRITICAL' ||
                            alert.alert_type === 'EXPIRED') &&
                            alert.stock_batch && (
                              <Link href={`/pharmacy?tab=inventory&batch=${alert.stock_batch}`}>
                                <Button variant="outline" size="sm" data-testid="view-batch-button">
                                  <Eye className="mr-1 h-4 w-4" />
                                  View Batch
                                </Button>
                              </Link>
                            )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            Showing {alerts.length} of {isDefaultFilterView ? totalCount : filteredAlerts.length}{' '}
            alerts (Page {page} of {totalPages})
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Alert</DialogTitle>
            <DialogDescription>Enter notes about how this alert was resolved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resolution-notes">Resolution Notes</Label>
              <Textarea
                id="resolution-notes"
                placeholder="Describe how the alert was resolved..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolveDialogOpen(false);
                setResolutionNotes('');
                setSelectedAlert(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={resolveAlert.isPending}>
              {resolveAlert.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resolving...
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alert Settings</DialogTitle>
            <DialogDescription>
              Configure alert thresholds and notification preferences.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expiry-warning-days">Expiry Warning Days</Label>
              <Input
                id="expiry-warning-days"
                type="number"
                value={expiryWarningDays}
                onChange={(e) => setExpiryWarningDays(e.target.value)}
                placeholder="90"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock is within this many days of expiry
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reorder-level">Low Stock Threshold / Reorder Level</Label>
              <Input
                id="reorder-level"
                type="number"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                placeholder="100"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock falls below this quantity
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await updateSettings.mutateAsync({
                    expiry_warning_days: parseInt(expiryWarningDays) || 90,
                    low_stock_threshold: parseInt(lowStockThreshold) || 100,
                  });
                  toast({
                    title: 'Settings saved',
                    description: 'Alert settings have been updated successfully.',
                  });
                  setSettingsDialogOpen(false);
                } catch (error) {
                  toast({
                    title: 'Error',
                    description: 'Failed to save settings.',
                    variant: 'destructive',
                  });
                }
              }}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
