'use client';

/**
 * MetabaseEmbed — renders an embedded Metabase dashboard or question
 * inside an iframe using a signed embed URL from the backend.
 *
 * The backend generates the embed URL using `METABASE_SITE_URL` (server-side).
 * In dev environments where the browser-accessible URL differs (e.g. VS Code
 * remote tunnels), set `NEXT_PUBLIC_METABASE_URL` on the frontend to override
 * the base URL while preserving the signed token path.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink, AlertTriangle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMetabaseEmbedUrl } from '@/lib/hooks/use-analytics';

/**
 * If `NEXT_PUBLIC_METABASE_URL` is set, rewrite the embed URL base to use it.
 * This handles the common dev case where the backend returns
 * `http://localhost:3333/embed/...` but the browser needs a tunnel URL.
 */
function rewriteEmbedUrl(embedUrl: string): string {
  const override = process.env.NEXT_PUBLIC_METABASE_URL;
  if (!override) return embedUrl;

  try {
    const parsed = new URL(embedUrl);
    const base = new URL(override);
    parsed.protocol = base.protocol;
    parsed.host = base.host;
    return parsed.toString();
  } catch {
    return embedUrl;
  }
}

export interface MetabaseEmbedProps {
  /** Metabase resource type */
  resourceType: 'dashboard' | 'question';
  /** Metabase resource ID */
  resourceId: number;
  /** Minimum height for the iframe */
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const embedUrl = data?.embed_url ? rewriteEmbedUrl(data.embed_url) : null;

  // Reset loaded/error state when URL changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
  }, [embedUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !embedUrl) {
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

  if (iframeError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <Settings className="h-8 w-8 text-muted-foreground" />
          <div className="text-center max-w-md space-y-2">
            <p className="text-sm font-medium">Metabase is not reachable</p>
            <p className="text-sm text-muted-foreground">
              The embedded dashboard could not connect. This usually means:
            </p>
            <ul className="text-sm text-muted-foreground text-left list-disc pl-5 space-y-1">
              <li>Metabase needs initial setup — visit the Metabase URL directly to complete the setup wizard</li>
              <li>The port is not forwarded to your browser (VS Code: forward port 3333)</li>
              <li>Set <code className="text-xs bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_METABASE_URL</code> in <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> if your browser URL differs from <code className="text-xs bg-muted px-1 py-0.5 rounded">localhost:3333</code></li>
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            asChild
          >
            <a href={embedUrl.split('/embed/')[0] || embedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open Metabase directly
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            asChild
          >
            <a href={embedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
          </Button>
        </div>
      )}
      <div className="relative rounded-lg border overflow-hidden" style={{ minHeight }}>
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="w-full border-0"
          style={{ minHeight, display: 'block' }}
          onLoad={() => setIframeLoaded(true)}
          onError={() => setIframeError(true)}
          title={title || `Metabase ${resourceType}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
