'use client';

/**
 * AnalyticsPageContent — wraps the built-in dashboard and the Superset
 * "Explore" tab in a tabbed container.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, CalendarDays, Compass, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { SupersetEmbed } from '@/components/analytics/superset-embed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSupersetDashboards } from '@/lib/hooks/use-analytics';
import type { Period } from '@/components/analytics/analytics-dashboard';

export function AnalyticsPageContent() {
  const [period, setPeriod] = useState<Period>('30d');
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);
  const { data: dashboards, isLoading: dashboardsLoading } = useSupersetDashboards();
  const selectedDashboard =
    dashboards?.find((dashboard) => dashboard.id === selectedDashboardId) ?? dashboards?.[0];

  return (
    <Tabs defaultValue="dashboard">
      <div className="flex items-center justify-between gap-2 text-xs sm:gap-4 sm:text-sm">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="explore" className="gap-1.5 text-xs sm:text-sm">
            <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Explore</span>
          </TabsTrigger>
        </TabsList>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-8 w-[110px] text-xs sm:h-9 sm:w-[140px] sm:text-sm">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0 sm:mr-2 sm:h-4 sm:w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
            <SelectItem value="90d">Last 90d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TabsContent value="dashboard" className="mt-4">
        <AnalyticsDashboard period={period} />
      </TabsContent>

      <TabsContent value="explore" className="mt-4 space-y-6">
        {dashboardsLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading dashboards…
          </div>
        )}

        {!dashboardsLoading && (!dashboards || dashboards.length === 0) && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
            No analytics dashboards are currently available for your facility.
          </div>
        )}

        {selectedDashboard && (
          <Card>
            <CardHeader className="space-y-3 pb-2">
              <CardTitle className="text-base">{selectedDashboard.name}</CardTitle>
              <Select
                value={String(selectedDashboard.id)}
                onValueChange={(value) => setSelectedDashboardId(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Choose a dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards?.map((dashboard) => (
                    <SelectItem key={dashboard.id} value={String(dashboard.id)}>
                      {dashboard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDashboard.description && (
                <p className="text-sm text-muted-foreground">{selectedDashboard.description}</p>
              )}
            </CardHeader>
            <CardContent>
              <SupersetEmbed
                dashboardId={selectedDashboard.id}
                title={selectedDashboard.name}
                minHeight="500px"
              />
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
