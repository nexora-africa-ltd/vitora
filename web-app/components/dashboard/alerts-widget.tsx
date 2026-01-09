'use client';

import Link from 'next/link';
import { AlertTriangle, Package, Clock, Activity, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStockAlerts } from '@/lib/hooks/use-pharmacy';

interface Alert {
  id: string;
  type: 'low_stock' | 'expiring' | 'critical_vital';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const alertIcons = {
  low_stock: Package,
  expiring: Clock,
  critical_vital: Activity,
  out_of_stock: XCircle,
};

const severityColors = {
  LOW: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  HIGH: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  CRITICAL: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function AlertsWidget() {
  const { data: alertsData, isLoading } = useStockAlerts({ resolved: false });
  
  const unresolvedAlerts = alertsData?.results?.filter((a) => !a.resolved) || [];
  
  // Group by severity
  const criticalCount = unresolvedAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highCount = unresolvedAlerts.filter((a) => a.severity === 'HIGH').length;
  const mediumCount = unresolvedAlerts.filter((a) => a.severity === 'MEDIUM').length;
  const lowCount = unresolvedAlerts.filter((a) => a.severity === 'LOW').length;

  if (isLoading) {
    return (
      <Card data-testid="alerts-widget">
        <CardHeader>
          <CardTitle className="text-lg">Stock Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Loading alerts...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (unresolvedAlerts.length === 0) {
    return (
      <Card data-testid="alerts-widget" className="alerts-summary">
        <CardHeader>
          <CardTitle className="text-lg">Stock Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No active alerts</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="alerts-widget" className="alerts-summary">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Stock Alerts</span>
          <Badge variant="destructive">{unresolvedAlerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert count summary */}
        <div className="grid grid-cols-2 gap-2">
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-red-50 border border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="text-sm font-semibold text-red-600">{criticalCount}</p>
              </div>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-orange-50 border border-orange-200">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-xs text-muted-foreground">High</p>
                <p className="text-sm font-semibold text-orange-600">{highCount}</p>
              </div>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 border border-yellow-200">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <div>
                <p className="text-xs text-muted-foreground">Medium</p>
                <p className="text-sm font-semibold text-yellow-600">{mediumCount}</p>
              </div>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Low</p>
                <p className="text-sm font-semibold text-blue-600">{lowCount}</p>
              </div>
            </div>
          )}
        </div>

        {/* Top critical alerts */}
        <div className="space-y-2">
          {unresolvedAlerts
            .filter((a) => a.severity === 'CRITICAL')
            .slice(0, 3)
            .map((alert) => {
              const alertType = alert.alert_type.toLowerCase().replace(/_/g, '_') as keyof typeof alertIcons;
              const Icon = alertIcons[alertType] || AlertTriangle;
              return (
                <div
                  key={alert.id}
                  className={cn(
                    'flex items-start gap-3 p-2 rounded-lg border text-sm',
                    severityColors[alert.severity]
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{alert.drug_name}</p>
                    <p className="text-xs opacity-80 truncate">{alert.message}</p>
                  </div>
                </div>
              );
            })}
        </div>

        {/* View all link */}
        <div className="pt-2">
          <Link href="/pharmacy?tab=alerts">
            <Button variant="outline" size="sm" className="w-full">
              View All Alerts
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
