'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ExternalLink, FileText, ImageIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api/client';

interface AttachmentPreview {
  id: number;
  claim_id: number;
  claim_number: string;
  attachment_type: string;
  attachment_type_display: string;
  name: string;
  description: string;
  mime_type: string;
  file_size: number | null;
  checksum: string;
  original_filename: string;
  uploaded_by_id: number;
  uploaded_by_name: string;
  created_at: string;
  file_url: string | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function toPreviewFetchPath(fileUrl?: string | null): string {
  if (!fileUrl) return '';
  try {
    const parsed = new URL(fileUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fileUrl;
  }
}

export default function ShaAttachmentPreviewPage() {
  const params = useParams();
  const attachmentId = Number(params.id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document-hub-sha-attachment-preview', attachmentId],
    queryFn: async () => {
      const response = await apiClient.get<AttachmentPreview>(
        `/api/core/document-hub/sha-attachments/${attachmentId}/`
      );
      return response.data;
    },
    enabled: Number.isFinite(attachmentId) && attachmentId > 0,
  });

  const fileKind = useMemo(() => {
    const mime = (data?.mime_type || '').toLowerCase();
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';
    return 'other';
  }, [data?.mime_type]);

  const [inlinePreviewUrl, setInlinePreviewUrl] = useState('');
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [inlinePreviewError, setInlinePreviewError] = useState<string | null>(null);
  const previewFetchPath = useMemo(() => toPreviewFetchPath(data?.file_url), [data?.file_url]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    setInlinePreviewUrl('');
    setInlinePreviewError(null);

    if (!data?.file_url || (fileKind !== 'pdf' && fileKind !== 'image')) {
      return;
    }

    setInlinePreviewLoading(true);
    void apiClient.get<Blob>(previewFetchPath, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setInlinePreviewUrl(objectUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setInlinePreviewError('Inline preview could not be loaded. Use Open Source File.');
      })
      .finally(() => {
        if (cancelled) return;
        setInlinePreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [data?.file_url, fileKind, previewFetchPath]);

  if (isLoading) {
    return <div className="py-6 text-sm text-muted-foreground">Loading attachment preview...</div>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Attachment Preview" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Could not load this attachment preview.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.name || `Attachment ${data.id}`}
        helpContent="Read-only SHA claim attachment preview from Document Hub."
      />

      <Card>
        <CardContent className="pt-4 space-y-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{data.attachment_type_display || data.attachment_type}</Badge>
            <Badge variant="secondary">Claim {data.claim_number || data.claim_id}</Badge>
            {fileKind === 'pdf' ? (
              <Badge variant="outline" className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />PDF</Badge>
            ) : null}
            {fileKind === 'image' ? (
              <Badge variant="outline" className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" />Image</Badge>
            ) : null}
          </div>

          <p><span className="text-muted-foreground">Description:</span> {data.description || 'N/A'}</p>
          <p><span className="text-muted-foreground">Original filename:</span> {data.original_filename || 'N/A'}</p>
          <p><span className="text-muted-foreground">MIME type:</span> {data.mime_type || 'N/A'}</p>
          <p><span className="text-muted-foreground">Size:</span> {formatBytes(data.file_size)}</p>
          <p><span className="text-muted-foreground">Uploaded by:</span> {data.uploaded_by_name || 'Unknown'}</p>
          <p><span className="text-muted-foreground">Uploaded at:</span> {new Date(data.created_at).toLocaleString()}</p>
          <p className="break-all"><span className="text-muted-foreground">SHA-256:</span> {data.checksum || 'N/A'}</p>

          {data.file_url ? (
            <div className="pt-2">
              <Button asChild size="sm" variant="outline">
                <Link href={data.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" />
                  Open Source File
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data.file_url ? (
        <Card>
          <CardContent className="pt-4">
            {inlinePreviewLoading ? (
              <div className="text-sm text-muted-foreground">Loading preview...</div>
            ) : inlinePreviewError ? (
              <div className="text-sm text-muted-foreground">{inlinePreviewError}</div>
            ) : (fileKind === 'image' || fileKind === 'pdf') && inlinePreviewUrl ? (
              <iframe
                title={`SHA attachment ${data.id}`}
                src={inlinePreviewUrl}
                className="w-full h-[65vh] rounded-md border"
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                Inline preview is not available for this file type. Use Open Source File.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
