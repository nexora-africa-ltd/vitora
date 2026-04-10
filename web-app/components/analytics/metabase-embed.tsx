'use client';

/**
 * MetabaseEmbed — renders an embedded Metabase dashboard or question
 * inside an iframe using a signed embed URL from the backend.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMetabaseEmbedUrl } from '@/lib/hooks/use-analytics';

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

  // Reset loaded state when URL changes
  useEffect(() => {
    setIframeLoaded(false);
  }, [data?.embed_url]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.embed_url) {
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
            <a href={data.embed_url} target="_blank" rel="noopener noreferrer">
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
          src={data.embed_url}
          className="w-full border-0"
          style={{ minHeight, display: iframeLoaded ? 'block' : 'block' }}
          onLoad={() => setIframeLoaded(true)}
          title={title || `Metabase ${resourceType}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
