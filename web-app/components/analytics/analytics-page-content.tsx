'use client';

/**
 * AnalyticsPageContent — wraps the built-in dashboard and the Metabase
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
import { MetabaseEmbed } from '@/components/analytics/metabase-embed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMetabaseDashboards } from '@/lib/hooks/use-analytics';
import type { Period } from '@/components/analytics/analytics-dashboard';

export function AnalyticsPageContent() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: dashboards, isLoading: dashboardsLoading } = useMetabaseDashboards();

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
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
          <p>
            The Explore tab connects to Metabase for ad-hoc analytics.
            Dashboards must be configured in Metabase first — add a data source, create questions, and pin them to these dashboards.
            {' '}
            <a
              href={process.env.NEXT_PUBLIC_METABASE_URL || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Open Metabase
            </a>
            {' '}to set them up.
          </p>
        </div>

        {dashboardsLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading dashboards…
          </div>
        )}

        {!dashboardsLoading && (!dashboards || dashboards.length === 0) && (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
            No dashboards configured for embedding yet. Open Metabase to create dashboards
            and enable them for embedding.
          </div>
        )}

        {dashboards?.map((dashboard) => (
          <Card key={dashboard.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dashboard.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <MetabaseEmbed
                resourceType="dashboard"
                resourceId={dashboard.id}
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
