'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { useToast } from '@/lib/hooks';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  useDocumentHub,
  useShareDocument,
  useSignFromHub,
} from '@/lib/hooks/use-document-hub';
import type { DocumentHubItem } from '@/lib/types/security';

type HubTab = 'mine' | 'shared' | 'signed' | 'pending';

function resolveDocumentHref(item: DocumentHubItem): string | null {
  switch (item.document_type) {
    case 'LabResult':
      return `/laboratory/results/${item.document_id}`;
    case 'Prescription':
      return `/pharmacy/prescriptions/${item.document_id}`;
    case 'RadiologyReport':
      return `/imaging/reports/${item.document_number}`;
    case 'DiagnosticReport':
      return `/laboratory/reports/${item.document_number}`;
    case 'SickNote':
      return `/sick-notes/${item.document_id}`;
    case 'ClinicalReferral':
      return `/referrals/${item.document_id}`;
    case 'Invoice':
      return `/transactions/invoices/${item.document_id}`;
    case 'SHAClaim':
      return `/transactions/sha-claims/${item.document_id}`;
    case 'SHAPreauth':
      return `/transactions/preauths/${item.document_id}`;
    case 'SHAClaimAttachment':
      return `/document-hub/sha-attachments/${item.document_id}`;
    case 'CreditNote':
      return `/transactions/credit-notes/${item.document_id}`;
    case 'Receipt':
      return `/transactions/receipts/${item.document_id}`;
    case 'Payment':
      return `/transactions/payments/${item.document_id}/receipt`;
    default:
      return null;
  }
}

function resolvePreviewHrefs(item: DocumentHubItem): string[] {
  switch (item.document_type) {
    case 'RadiologyReport':
      return [
        `/imaging/reports/${encodeURIComponent(item.document_number)}`,
        `/imaging/reports/${item.document_id}`,
      ];
    case 'DiagnosticReport':
      return [
        `/laboratory/reports/${encodeURIComponent(item.document_number)}`,
        `/laboratory/reports/${item.document_id}`,
      ];
    case 'Receipt':
      return [
        `/transactions/receipts/${item.document_id}`,
        `/transactions/payments/${item.document_id}/receipt`,
        '/transactions/receipts',
      ];
    case 'SHAClaimAttachment':
      return [`/document-hub/sha-attachments/${item.document_id}`];
    case 'Payment':
      return [
        `/transactions/payments/${item.document_id}/receipt`,
        `/transactions/receipts/${item.document_id}`,
      ];
    default: {
      const href = resolveDocumentHref(item);
      return href ? [href] : [];
    }
  }
}

export default function DocumentHubPage() {
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState<HubTab>('mine');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [previewItem, setPreviewItem] = useState<DocumentHubItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentHubItem | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | undefined>(undefined);
  const [permission, setPermission] = useState<'VIEW' | 'SIGN'>('VIEW');
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [previewUrlIndex, setPreviewUrlIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const debouncedQuery = useDebounce(q, 350);

  const { data, isLoading, isFetching, refetch } = useDocumentHub({
    tab,
    q: debouncedQuery || undefined,
    page,
    page_size: pageSize,
  });
  const shareDocument = useShareDocument();
  const signDocument = useSignFromHub();

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedQuery, pageSize]);

  const items = useMemo(() => data?.results ?? [], [data?.results]);
  const totalCount = data?.count ?? items.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalCount);

  const stats = useMemo(() => {
    const total = totalCount;
    const signed = items.filter((item) => item.is_signed).length;
    const pending = items.filter((item) => item.can_sign).length;
    const shared = items.filter((item) => item.is_shared_with_me).length;
    return { total, signed, pending, shared };
  }, [items, totalCount]);

  const handleShare = async () => {
    if (!selected || !selectedRecipientId) {
      toast({ title: 'Select a recipient staff member', variant: 'destructive' });
      return;
    }

    try {
      await shareDocument.mutateAsync({
        document_type: selected.document_type,
        document_id: selected.document_id,
        shared_with: selectedRecipientId,
        permission,
      });
      toast({ title: 'Document shared' });
      setShareOpen(false);
      setSelected(null);
      setSelectedRecipientId(undefined);
      setPermission('VIEW');
      refetch();
    } catch (error) {
      toast({
        title: 'Failed to share document',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleSign = async (item: DocumentHubItem) => {
    try {
      await signDocument.mutateAsync({
        document_type: item.document_type,
        document_id: item.document_id,
      });
      toast({ title: 'Document signed' });
      refetch();
    } catch (error) {
      toast({
        title: 'Failed to sign document',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const previewHref = previewItem ? resolveDocumentHref(previewItem) : null;
  const previewHrefs = useMemo(() => (previewItem ? resolvePreviewHrefs(previewItem) : []), [previewItem]);
  const iframeSrc = previewHrefs[previewUrlIndex] ?? null;
  const formatDateTime = (value: string | null) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  return (
    <PullToRefresh onRefresh={() => { refresh(); refetch(); }} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Document Hub"
          helpContent="View documents attributable to you, access shared documents, and apply cryptographic signatures."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-4"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Visible</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-2xl font-bold">{stats.signed}</p><p className="text-xs text-muted-foreground">Signed</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-muted-foreground">Pending Signature</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-2xl font-bold">{stats.shared}</p><p className="text-xs text-muted-foreground">Shared</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as HubTab)}>
              <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="shared">Shared With Me</TabsTrigger>
                <TabsTrigger value="signed">Signed</TabsTrigger>
                <TabsTrigger value="pending">Pending Signature</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Search by number, patient, owner..."
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-2">
             {isLoading ? (
               <p className="text-sm text-muted-foreground py-6">Loading documents...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No documents found.</p>
            ) : (
              <div className="space-y-3 py-3">
                {items.map((item) => {
                  const href = resolveDocumentHref(item);
                  return (
                    <div key={`${item.document_type}-${item.document_id}`} className="border rounded-md p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{item.document_type} - {item.document_number}</p>
                          <Badge variant={item.is_signed ? 'default' : 'secondary'}>{item.is_signed ? 'Signed' : 'Unsigned'}</Badge>
                          {item.is_shared_with_me && item.share_permission ? (
                            <Badge variant="outline">Shared ({item.share_permission})</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.patient_name || 'No patient'} • Owner: {item.owner_name || 'Unknown'}</p>
                        {item.shared_by_name ? (
                          <p className="text-xs text-muted-foreground">Shared by {item.shared_by_name}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {href ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPreviewItem(item);
                              setIframeError(false);
                              setIframeLoading(true);
                              setPreviewUrlIndex(0);
                            }}
                            className="inline-flex items-center gap-1"
                          >
                              <Eye className="h-4 w-4" />
                              View
                          </Button>
                        ) : null}
                        {item.can_sign ? (
                          <Button size="sm" onClick={() => handleSign(item)} disabled={signDocument.isPending}>
                            Sign
                          </Button>
                        ) : null}
                        {!item.is_shared_with_me ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelected(item);
                              setShareOpen(true);
                            }}
                          >
                            Share
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t mt-2 pt-3 pb-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {totalCount}
                {isFetching && !isLoading ? ' • Refreshing...' : ''}
              </p>
              <div className="flex items-center gap-2 justify-end">
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-[110px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / page</SelectItem>
                    <SelectItem value="20">20 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  Previous
                </Button>
                <p className="text-xs text-muted-foreground min-w-[60px] text-center">Page {page} / {pageCount}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page >= pageCount || isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={shareOpen}
          onOpenChange={(open) => {
            setShareOpen(open);
            if (!open) {
              setSelectedRecipientId(undefined);
              setPermission('VIEW');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Document</DialogTitle>
              <DialogDescription>
                Share {selected?.document_type} {selected?.document_number} with another user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Recipient staff member</label>
                <StaffSearchCombobox
                  value={selectedRecipientId}
                  onSelect={(userId) => setSelectedRecipientId(userId)}
                  placeholder="Select staff member to share with..."
                  searchPlaceholder="Search by name, email, or employee ID..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Permission</label>
                <Select value={permission} onValueChange={(value) => setPermission(value as 'VIEW' | 'SIGN')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEW">VIEW</SelectItem>
                    <SelectItem value="SIGN">SIGN (includes VIEW)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  SIGN grants both viewing and signing rights.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShareOpen(false);
                  setSelectedRecipientId(undefined);
                  setPermission('VIEW');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={shareDocument.isPending}>
                {shareDocument.isPending ? 'Sharing...' : 'Share'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={previewItem !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewItem(null);
              setIframeError(false);
              setIframeLoading(false);
              setPreviewUrlIndex(0);
            }
          }}
        >
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>
                {previewItem?.document_type} {previewItem?.document_number}
              </DialogTitle>
              <DialogDescription>
                Quick preview from Document Hub. Use Open Full Page for complete workflows and editing.
              </DialogDescription>
            </DialogHeader>
            {previewItem ? (
              <div className="space-y-4 py-2 text-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={previewItem.is_signed ? 'default' : 'secondary'}>
                        {previewItem.is_signed ? 'Signed' : 'Unsigned'}
                      </Badge>
                      {previewItem.is_shared_with_me && previewItem.share_permission ? (
                        <Badge variant="outline">Shared ({previewItem.share_permission})</Badge>
                      ) : null}
                      {previewItem.can_sign ? <Badge variant="secondary">Can Sign</Badge> : null}
                    </div>
                    <p><span className="text-muted-foreground">Title:</span> {previewItem.title}</p>
                    <p><span className="text-muted-foreground">Type:</span> {previewItem.document_type}</p>
                    <p><span className="text-muted-foreground">Document ID:</span> {previewItem.document_id}</p>
                    <p><span className="text-muted-foreground">Document Number:</span> {previewItem.document_number}</p>
                    <p><span className="text-muted-foreground">Status:</span> {previewItem.status || 'N/A'}</p>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p><span className="text-muted-foreground">Patient:</span> {previewItem.patient_name || 'No patient'}</p>
                    <p><span className="text-muted-foreground">Owner:</span> {previewItem.owner_name || 'Unknown'}</p>
                    <p><span className="text-muted-foreground">Signed At:</span> {formatDateTime(previewItem.signed_at)}</p>
                    <p><span className="text-muted-foreground">Shared At:</span> {formatDateTime(previewItem.shared_at)}</p>
                    <p><span className="text-muted-foreground">Shared By:</span> {previewItem.shared_by_name || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Share Permission:</span> {previewItem.share_permission || 'N/A'}</p>
                  </div>
                </div>

                {iframeSrc ? (
                  <div className="rounded-md border overflow-hidden">
                    {iframeLoading ? (
                      <div className="h-[420px] flex items-center justify-center text-muted-foreground">
                        Loading preview...
                      </div>
                    ) : null}
                    {iframeError ? (
                      <div className="h-[420px] flex items-center justify-center text-muted-foreground px-4 text-center">
                        Unable to load inline preview. Use Open Full Page to view this document.
                      </div>
                    ) : (
                      <iframe
                        ref={iframeRef}
                        title={`Document preview ${previewItem.document_type} ${previewItem.document_number}`}
                        src={iframeSrc}
                        className={`w-full h-[420px] ${iframeLoading ? 'hidden' : 'block'}`}
                        onLoad={() => {
                          const frame = iframeRef.current;
                          let detected404 = false;
                          try {
                            const title = (frame?.contentDocument?.title || '').toLowerCase();
                            const bodyText = (frame?.contentDocument?.body?.innerText || '')
                              .toLowerCase()
                              .slice(0, 500);
                            detected404 =
                              title.includes('404') ||
                              title.includes('not found') ||
                              bodyText.includes('404') ||
                              bodyText.includes('not found');
                          } catch {
                            detected404 = false;
                          }

                          if (detected404 && previewUrlIndex < previewHrefs.length - 1) {
                            setPreviewUrlIndex((current) => current + 1);
                            setIframeLoading(true);
                            return;
                          }

                          if (detected404) {
                            setIframeError(true);
                          }
                          setIframeLoading(false);
                        }}
                        onError={() => {
                          if (previewUrlIndex < previewHrefs.length - 1) {
                            setPreviewUrlIndex((current) => current + 1);
                            setIframeLoading(true);
                            return;
                          }
                          setIframeLoading(false);
                          setIframeError(true);
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border p-4 text-muted-foreground">
                    Inline preview is not available for this document type.
                  </div>
                )}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewItem(null)}>Close</Button>
              {previewHref ? (
                <Button asChild>
                  <Link href={previewHref} onClick={() => setPreviewItem(null)}>
                    Open Full Page
                  </Link>
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
