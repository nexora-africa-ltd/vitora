'use client';

/**
 * SupersetEmbed — renders an embedded Superset dashboard using the
 * @superset-ui/embedded-sdk.
 *
 * The SDK inserts a sandboxed iframe pointing at the Superset instance.
 * A guest token (fetched from our backend) provides auth + RLS scoping.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { analyticsApi } from '@/lib/api/analytics';

export interface SupersetEmbedProps {
  /** Superset dashboard ID (numeric, from our backend list endpoint). */
  dashboardId: number;
  /** The Superset embedded UUID for the dashboard (string). */
  embeddedId: string;
  /** Superset instance domain, e.g. "https://superset.example.com" */
  supersetDomain: string;
  /** Minimum height for the embed container */
  minHeight?: string;
  /** Optional title shown above the embed */
  title?: string;
}

export function SupersetEmbed({
  dashboardId,
  embeddedId,
  supersetDomain,
  minHeight = '600px',
  title,
}: SupersetEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuestToken = useCallback(async () => {
    const resp = await analyticsApi.getSupersetGuestToken(dashboardId);
    return resp.guest_token;
  }, [dashboardId]);

  useEffect(() => {
    if (!containerRef.current || !embeddedId || !supersetDomain) return;

    let cancelled = false;
    const mountPoint = containerRef.current;

    (async () => {
      try {
        const { embedDashboard } = await import('@superset-ui/embedded-sdk');

        if (cancelled || !mountPoint) return;

        await embedDashboard({
          id: embeddedId,
          supersetDomain,
          mountPoint,
          fetchGuestToken,
          dashboardUiConfig: {
            hideTitle: false,
            hideChartControls: false,
            filters: { expanded: false },
          },
          iframeSandboxExtras: ['allow-top-navigation'],
        });

        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load dashboard'
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Clean up SDK-injected DOM nodes so React doesn't choke
      while (mountPoint.firstChild) {
        mountPoint.removeChild(mountPoint.firstChild);
      }
    };
  }, [embeddedId, supersetDomain, fetchGuestToken]);

  if (error) {
    const isNotConfigured = error.includes('503') || error.includes('not configured');
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {isNotConfigured
              ? 'Superset embedding is not configured. Contact your administrator.'
              : `Failed to load the embedded dashboard: ${error}`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      )}
      <div
        className="relative rounded-lg border overflow-hidden"
        style={{ minHeight, height: minHeight }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {/* Separate div for SDK — React won't touch its children */}
        <div ref={containerRef} className="superset-embed-container h-full w-full" />
      </div>
    </div>
  );
}
