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

const SUPERSET_DOMAIN = process.env.NEXT_PUBLIC_SUPERSET_URL || '';

export function AnalyticsPageContent() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: dashboards, isLoading: dashboardsLoading } = useSupersetDashboards();

  return (
    <Tabs defaultValue="dashboard">
      <div className="flex items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm">
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
          <SelectTrigger className="w-[110px] sm:w-[140px] text-xs sm:text-sm h-8 sm:h-9">
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 shrink-0" />
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
        {!SUPERSET_DOMAIN && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
            <p>
              Superset is not configured. Set <code>NEXT_PUBLIC_SUPERSET_URL</code> to
              enable embedded dashboards.
            </p>
          </div>
        )}

        {SUPERSET_DOMAIN && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
            <p>
              The Explore tab connects to Apache Superset for ad-hoc analytics.
              Dashboards must be created and published in Superset first.
              {' '}
              <a
                href={SUPERSET_DOMAIN}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Open Superset
              </a>
              {' '}to manage them.
            </p>
          </div>
        )}

        {dashboardsLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading dashboards…
          </div>
        )}

        {!dashboardsLoading && (!dashboards || dashboards.length === 0) && SUPERSET_DOMAIN && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
            No dashboards available for embedding yet. Open Superset to create and
            publish dashboards.
          </div>
        )}

        {dashboards?.filter((d) => d.embedded_id).map((dashboard) => (
          <Card key={dashboard.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dashboard.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <SupersetEmbed
                dashboardId={dashboard.id}
                embeddedId={dashboard.embedded_id}
                supersetDomain={SUPERSET_DOMAIN}
                title={dashboard.name}
                minHeight="500px"
              />
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}
