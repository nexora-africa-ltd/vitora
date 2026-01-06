'use client';

import { AlertTriangle, Package, Clock, Activity } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';

interface Alert {
  id: string;
  type: 'low_stock' | 'expiring' | 'critical_vital';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// TODO : Replace with actual data from API
const mockAlerts: Alert[] = [
  {
    id: '1',
    type: 'critical_vital',
    title: 'Critical SpO2',
    description: 'Patient Jane Doe has SpO2 at 92%',
    severity: 'critical',
  },
  {
    id: '2',
    type: 'low_stock',
    title: 'Low Stock Alert',
    description: 'Paracetamol 500mg - 45 units remaining',
    severity: 'medium',
  },
  {
    id: '3',
    type: 'expiring',
    title: 'Expiring Soon',
    description: 'Amoxicillin Batch #A123 expires in 30 days',
    severity: 'low',
  },
];

const alertIcons = {
  low_stock: Package,
  expiring: Clock,
  critical_vital: Activity,
};

const severityColors = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function AlertsWidget() {
  if (mockAlerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mockAlerts.map((alert) => {
        const Icon = alertIcons[alert.type];
        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              severityColors[alert.severity]
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="text-xs opacity-80 truncate">{alert.description}</p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0">
              View
            </Button>
          </div>
        );
      })}
    </div>
  );
}
