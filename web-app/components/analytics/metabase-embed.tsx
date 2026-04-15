'use client';

/**
 * MetabaseEmbed — renders an embedded Metabase dashboard or question
 * using the Metabase Embedding SDK (web component approach).
 *
 * The SDK loads `embed.js` from the Metabase instance and renders via
 * `<metabase-dashboard>` / `<metabase-question>` custom elements.
 * This avoids iframe COEP/X-Frame-Options issues entirely.
 */

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Loader2, AlertTriangle, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useMetabaseEmbedUrl } from '@/lib/hooks/use-analytics';

// Declare the custom elements for TypeScript
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'metabase-dashboard': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          token?: string;
          'with-title'?: string;
          'with-downloads'?: string;
        },
        HTMLElement
      >;
      'metabase-question': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          token?: string;
          'with-title'?: string;
        },
        HTMLElement
      >;
    }
  }
}

export interface MetabaseEmbedProps {
  /** Metabase resource type */
  resourceType: 'dashboard' | 'question';
  /** Metabase resource ID */
  resourceId: number;
  /** Minimum height for the embed */
  minHeight?: string;
  /** Optional title shown above the embed */
  title?: string;
}

export function MetabaseEmbed({
  resourceType,
  resourceId,
  minHeight = '600px',
  title,
}: MetabaseEmbedProps) {
  const { data, isLoading, error } = useMetabaseEmbedUrl(resourceType, resourceId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  const token = data?.token ?? null;
  const instanceUrl = data?.instance_url ?? null;

  // Configure Metabase SDK when instance URL is available
  useEffect(() => {
    if (!instanceUrl) return;
    (window as unknown as Record<string, unknown>).metabaseConfig = {
      theme: { preset: 'light' },
      isGuest: true,
      instanceUrl,
    };
  }, [instanceUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !token || !instanceUrl) {
    const isNotConfigured = error?.message?.includes('503');
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {isNotConfigured
              ? 'Metabase embedding is not configured. Contact your administrator to set up the METABASE_EMBEDDING_SECRET.'
              : 'Failed to load the embedded dashboard. Please try again later.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (scriptError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <Settings className="h-8 w-8 text-muted-foreground" />
          <div className="text-center max-w-md space-y-2">
            <p className="text-sm font-medium">Metabase is not reachable</p>
            <p className="text-sm text-muted-foreground">
              Could not load the Metabase embed SDK. The Metabase instance may be
              offline or the URL may be misconfigured.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      )}

      {/* Load the Metabase embed SDK script */}
      <Script
        src={`${instanceUrl}/app/embed.js`}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onError={() => setScriptError(true)}
      />

      <div
        ref={containerRef}
        className="relative rounded-lg border overflow-hidden"
        style={{ minHeight }}
      >
        {!sdkReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {sdkReady && resourceType === 'dashboard' && (
          <metabase-dashboard
            token={token}
            with-title="true"
            with-downloads="true"
            style={{ minHeight, display: 'block', width: '100%' }}
          />
        )}

        {sdkReady && resourceType === 'question' && (
          <metabase-question
            token={token}
            with-title="true"
            style={{ minHeight, display: 'block', width: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
