'use client';

import { useState, useRef } from 'react';
import {
  Search,
  Upload,
  Trash2,
  FileText,
  Library,
  AlertCircle,
  Loader2,
  FileUp,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { getApiErrorMessage } from '@/lib/api/client';
import {
  useFacilityKB,
  useFacilityKBSearch,
  useUploadToFacilityKB,
  useDeleteFacilityKBDocument,
} from '@/lib/hooks/use-ai';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ──────────────────────────────────────────────────────────────────────

function DocumentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-8 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Search Results
// ──────────────────────────────────────────────────────────────────────

function SearchResult({
  result,
}: {
  result: { id: string; filename: string; snippet?: string; score?: number };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-medium">{result.filename}</h4>
              {result.score != null && result.score > 0 && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {(result.score * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
            {result.snippet && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Document List Item
// ──────────────────────────────────────────────────────────────────────

function DocumentItem({
  document: doc,
  onDelete,
  isDeleting,
}: {
  document: {
    id: string;
    filename: string;
    size_bytes?: number;
    uploaded_at?: string;
    status?: string;
  };
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-medium">{doc.filename}</h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatBytes(doc.size_bytes)}</span>
              {doc.uploaded_at && <span>· {formatDate(doc.uploaded_at)}</span>}
              {doc.status && (
                <Badge
                  variant="outline"
                  className={`h-5 px-1.5 text-[10px] ${
                    doc.status === 'processed'
                      ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                      : doc.status === 'processing'
                        ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                        : 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400'
                  }`}
                >
                  {doc.status}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(doc.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { data: kbData, isLoading: kbLoading, error: kbError } = useFacilityKB();
  const { data: searchData, isLoading: searchLoading } = useFacilityKBSearch(debouncedSearch, 20);
  const uploadMutation = useUploadToFacilityKB();
  const deleteMutation = useDeleteFacilityKBDocument();
  const { refresh, isRefreshing } = usePageRefresh();

  const hasSearch = debouncedSearch.length >= 2;
  const documents = kbData?.documents ?? [];
  const docCount = kbData?.document_count ?? documents.length;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file, {
      onSuccess: () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      onError: () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  }

  function handleDelete(documentId: string) {
    deleteMutation.mutate(documentId, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Knowledge Base"
          helpContent="Upload facility-specific protocols, guidelines, and reference documents. TibaBot uses these documents to provide context-aware clinical assistance tailored to your facility's practices."
        />

        {/* Stats bar */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <Library className="h-4 w-4 shrink-0" />
          <span>
            {docCount} document{docCount !== 1 ? 's' : ''}
          </span>
          {kbData?.total_size_bytes != null && (
            <span className="text-muted-foreground/60">
              · {formatBytes(kbData.total_size_bytes)} total
            </span>
          )}
        </div>

        {/* Upload + Search bar */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search facility documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md,.html"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            className="shrink-0 gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </Button>
        </div>

        {/* Upload error */}
        {uploadMutation.isError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Upload failed: {(uploadMutation.error as Error)?.message || 'Unknown error'}
          </div>
        )}

        {/* Upload success */}
        {uploadMutation.isSuccess && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <FileUp className="h-4 w-4 shrink-0" />
            &ldquo;{uploadMutation.data.documents[0]?.filename}&rdquo; uploaded successfully
          </div>
        )}

        {/* Search results */}
        {hasSearch ? (
          searchLoading ? (
            <DocumentsSkeleton />
          ) : searchData?.results && searchData.results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {searchData.total ?? searchData.results.length} result
                {(searchData.total ?? 0) !== 1 ? 's' : ''} for &ldquo;{debouncedSearch}&rdquo;
              </p>
              {searchData.results.map((result) => (
                <SearchResult key={result.id} result={result} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No results for &ldquo;{debouncedSearch}&rdquo;
              </p>
            </div>
          )
        ) : kbLoading ? (
          <DocumentsSkeleton />
        ) : kbError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {getApiErrorMessage(kbError)}
          </div>
        ) : documents.length > 0 ? (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-2">
              {documents.map((doc) => (
                <DocumentItem
                  key={doc.id}
                  document={doc}
                  onDelete={(id) => setDeleteTarget(id)}
                  isDeleting={deleteTarget === doc.id && deleteMutation.isPending}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Library className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <h3 className="mb-1 text-sm font-medium">No documents uploaded</h3>
              <p className="max-w-sm text-xs text-muted-foreground">
                Upload facility protocols, clinical guidelines, and SOPs to help TibaBot provide
                tailored, context-aware clinical assistance for your facility.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload a document
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete document</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this document? TibaBot will no longer use it for
                clinical context.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && handleDelete(deleteTarget)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
