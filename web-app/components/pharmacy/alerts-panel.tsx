/**
 * Alerts Panel Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
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
import { useAcknowledgeAlert, useResolveAlert, useAlertSettings, useUpdateAlertSettings } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';

interface AlertsPanelProps {
  alerts: StockAlert[];
  isLoading: boolean;
  error: Error | null;
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
};

// Severity badge colors
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  LOW: 'bg-blue-100 text-blue-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

// Alert type test id
const ALERT_TYPE_TEST_IDS: Record<AlertType, string> = {
  LOW_STOCK: 'alert-icon-low-stock',
  OUT_OF_STOCK: 'alert-icon-out-of-stock',
  EXPIRING_SOON: 'alert-icon-expiring-soon',
  EXPIRING_CRITICAL: 'alert-icon-expiring-critical',
  EXPIRED: 'alert-icon-expired',
  RECALLED: 'alert-icon-recalled',
};

export function AlertsPanel({
  alerts,
  isLoading,
  error,
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
  const filteredAlerts = alerts.filter((alert) => {
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
  });

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
    try {
      // Create CSV content
      const headers = ['Drug Name', 'Drug Code', 'Alert Type', 'Severity', 'Message', 'Batch Number', 'Created At', 'Acknowledged', 'Resolved'];
      const rows = filteredAlerts.map(alert => [
        alert.drug_name || '',
        alert.drug_code || '',
        alert.alert_type,
        alert.severity,
        alert.message,
        alert.batch_number || '',
        format(new Date(alert.created_at), 'yyyy-MM-dd HH:mm:ss'),
        alert.acknowledged ? 'Yes' : 'No',
        alert.resolved ? 'Yes' : 'No',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `stock-alerts-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export successful',
        description: 'Alerts have been exported to CSV.',
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: 'Failed to export alerts.',
        variant: 'destructive',
      });
    }
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
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
        <p className="text-muted-foreground">No active alerts</p>
        <p className="text-sm text-muted-foreground mt-1">All stock levels are within normal range</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4">
          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Label htmlFor="type-filter">Type</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as AlertType | 'all')}>
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
            <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as AlertSeverity | 'all')}>
              <SelectTrigger id="severity-filter" data-testid="severity-filter" className="w-[150px]">
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

        <div className="flex gap-2 flex-wrap">
          {/* Export button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="export-alerts-button"
            onClick={handleExport}
            disabled={filteredAlerts.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
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
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Settings button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="alert-settings-button"
            onClick={() => setSettingsDialogOpen(true)}
          >
            <Settings className="h-4 w-4 mr-1" />
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
          <TabsTrigger value="all">All</TabsTrigger>
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
                  className={`${
                    alert.severity === 'CRITICAL' ? 'border-red-500 bg-red-50/50' :
                    alert.severity === 'HIGH' ? 'border-orange-500 bg-orange-50/50' :
                    alert.severity === 'MEDIUM' ? 'border-yellow-500 bg-yellow-50/50' :
                    'border-blue-500 bg-blue-50/50'
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        data-testid={testId}
                        className={`p-2 rounded-full ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-100'
                            : alert.severity === 'HIGH'
                            ? 'bg-orange-100'
                            : alert.severity === 'MEDIUM'
                            ? 'bg-yellow-100'
                            : 'bg-blue-100'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            alert.severity === 'CRITICAL'
                              ? 'text-red-600'
                              : alert.severity === 'HIGH'
                              ? 'text-orange-600'
                              : alert.severity === 'MEDIUM'
                              ? 'text-yellow-600'
                              : 'text-blue-600'
                          }`}
                        />
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
                            {format(new Date(alert.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground">{alert.message}</p>

                        {/* Status badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Auto-generated badge - all stock alerts are system generated */}
                          <Badge variant="outline" className="text-xs">
                            System Generated
                          </Badge>
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged by {alert.acknowledged_by_name} on{' '}
                              {alert.acknowledged_at && format(new Date(alert.acknowledged_at), 'MMM d')}
                            </Badge>
                          )}
                          {alert.batch_number && alert.stock_batch && (
                            <Link href={`/pharmacy?tab=inventory&batch=${alert.stock_batch}`}>
                              <Badge variant="outline" className="text-xs hover:bg-accent cursor-pointer">
                                <Package className="h-3 w-3 mr-1" />
                                {alert.batch_number}
                              </Badge>
                            </Link>
                          )}
                          {alert.batch_number && !alert.stock_batch && (
                            <Badge variant="outline" className="text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              {alert.batch_number}
                            </Badge>
                          )}
                          {alert.resolved && (
                            <Badge variant="outline" className="text-xs bg-green-50">
                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                              Resolved
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 flex-wrap">
                          {!alert.acknowledged && !alert.resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="acknowledge-button"
                              onClick={() => handleAcknowledge(alert.id)}
                              disabled={acknowledgeAlert.isPending}
                            >
                              {acknowledgeAlert.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
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
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
                              )}
                              Resolve
                            </Button>
                          )}
                          {(alert.alert_type === 'LOW_STOCK' || alert.alert_type === 'OUT_OF_STOCK') && (
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
                              <ShoppingCart className="h-4 w-4 mr-1" />
                              Reorder
                            </Button>
                          )}
                          {(alert.alert_type === 'EXPIRING_SOON' || alert.alert_type === 'EXPIRING_CRITICAL' || alert.alert_type === 'EXPIRED') && alert.stock_batch && (
                            <Link href={`/pharmacy?tab=inventory&batch=${alert.stock_batch}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid="view-batch-button"
                              >
                                <Eye className="h-4 w-4 mr-1" />
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

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Alert</DialogTitle>
            <DialogDescription>
              Enter notes about how this alert was resolved.
            </DialogDescription>
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
            <Button
              variant="outline"
              onClick={() => setSettingsDialogOpen(false)}
            >
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
