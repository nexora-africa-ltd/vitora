/**
 * Alerts Panel Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  XCircle,
  Clock,
  CheckCircle,
  Package,
  Bell,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StockAlert, AlertType, AlertSeverity } from '@/lib/types/pharmacy';
import { useAcknowledgeAlert, useResolveAlert } from '@/lib/hooks/use-pharmacy';

interface AlertsPanelProps {
  alerts: StockAlert[];
  isLoading: boolean;
  error: Error | null;
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

export function AlertsPanel({ alerts, isLoading, error }: AlertsPanelProps) {
  const [activeTab, setActiveTab] = useState('all');
  const acknowledgeAlert = useAcknowledgeAlert();
  const resolveAlert = useResolveAlert();

  // Filter alerts based on active tab
  const filteredAlerts = alerts.filter((alert) => {
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
          <TabsTrigger value="expiring">Expiring</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="space-y-4">
            {filteredAlerts.map((alert) => {
              const Icon = ALERT_TYPE_ICONS[alert.alert_type];
              const testId = ALERT_TYPE_TEST_IDS[alert.alert_type];

              return (
                <Card key={alert.id} data-testid="alert-item">
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
                            : 'bg-yellow-100'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            alert.severity === 'CRITICAL'
                              ? 'text-red-600'
                              : alert.severity === 'HIGH'
                              ? 'text-orange-600'
                              : 'text-yellow-600'
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{alert.drug_name}</span>
                            <Badge className={SEVERITY_COLORS[alert.severity]}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground">{alert.message}</p>

                        {/* Status */}
                        <div className="flex items-center gap-2">
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged
                            </Badge>
                          )}
                          {alert.batch_number && (
                            <Badge variant="outline" className="text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              Batch: {alert.batch_number}
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          {!alert.acknowledged && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => acknowledgeAlert.mutate(alert.id)}
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
                          {alert.acknowledged && !alert.resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resolveAlert.mutate({ id: alert.id })}
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
    </div>
  );
}
