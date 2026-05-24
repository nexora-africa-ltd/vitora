'use client';

import { useState } from 'react';
import { Search, Pill, ShieldCheck, BookOpen, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useFormularySearch, useSmpcDetail, useFormularyStats } from '@/lib/hooks/use-formulary';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { SmpcSummary, PpbProduct, KemlEntry } from '@/lib/types/formulary';

// ──────────────────────────────────────────────────────────────────────
// KEML Level Badge
// ──────────────────────────────────────────────────────────────────────

function KemlLevelBadge({ level, description }: { level: number; description: string }) {
  const colors: Record<number, string> = {
    1: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    3: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    4: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    5: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return (
    <Badge className={`${colors[level] || colors[3]} shrink-0 w-fit`}>
      H{level} — {description}
    </Badge>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PPB Validity Badge
// ──────────────────────────────────────────────────────────────────────

function ValidityBadge({ isValid, expiryDate }: { isValid: boolean; expiryDate: string }) {
  const expired = new Date(expiryDate) < new Date();
  if (!isValid || expired) {
    return (
      <Badge variant="destructive" className="shrink-0 w-fit">
        Expired
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shrink-0 w-fit">
      Valid
    </Badge>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SmPC Card
// ──────────────────────────────────────────────────────────────────────

function SmpcCard({ item, onViewDetail }: { item: SmpcSummary; onViewDetail: (id: string) => void }) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500" onClick={() => onViewDetail(item.id)}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{item.product_name}</h3>
            {item.active_ingredients.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {item.active_ingredients.join(', ')}
              </p>
            )}
            {item.pharmaceutical_form && (
              <p className="text-xs text-muted-foreground">
                {item.pharmaceutical_form}
              </p>
            )}
            {item.indications && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {item.indications}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 self-start">
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PPB Product Card
// ──────────────────────────────────────────────────────────────────────

function PpbProductCard({ item }: { item: PpbProduct }) {
  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm">{item.trade_name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {item.active_ingredient} • {item.dosage_form}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.manufacturer} ({item.country_of_origin})
            </p>
            <p className="text-xs text-muted-foreground">
              Reg: {item.registration_no} • {item.category}
            </p>
          </div>
          <ValidityBadge isValid={item.is_valid} expiryDate={item.date_expiry} />
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// KEML Card
// ──────────────────────────────────────────────────────────────────────

function KemlCard({ item }: { item: KemlEntry }) {
  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm">{item.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Code: {item.code} • {item.subcategory}
            </p>
            {item.sub_subcategory && (
              <p className="text-xs text-muted-foreground">{item.sub_subcategory}</p>
            )}
            {item.dose_forms.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {item.dose_forms.map((df) => {
                  const s = df.strengths?.join(', ') || df.strength || '';
                  return s ? `${df.form} (${s})` : df.form;
                }).join('; ')}
              </p>
            )}
            {item.footnotes && (
              <p className="text-xs text-muted-foreground italic mt-1">{item.footnotes}</p>
            )}
          </div>
          <KemlLevelBadge level={item.level_of_use} description={item.level_description} />
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SmPC Detail Modal
// ──────────────────────────────────────────────────────────────────────

function SmpcSection({ title, content }: { title: string; content?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!content) return null;

  const isLong = content.length > 200;
  const displayContent = isLong && !expanded ? content.slice(0, 200) + '…' : content;

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{displayContent}</p>
      {isLong && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" /> Show more
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function SmpcDetailModal({
  docId,
  open,
  onClose,
}: {
  docId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useSmpcDetail(open ? docId : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isLoading ? 'Loading...' : data?.product_name || 'SmPC Detail'}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="space-y-4">
              {data.pharmaceutical_form && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Form:</span>{' '}
                  <span className="text-sm">{data.pharmaceutical_form}</span>
                </div>
              )}
              {data.active_ingredients.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Active Ingredients:</span>{' '}
                  <span className="text-sm">{data.active_ingredients.join(', ')}</span>
                </div>
              )}
              <SmpcSection title="Indications" content={data.indications} />
              <SmpcSection title="Posology & Administration" content={data.posology} />
              <SmpcSection title="Contraindications" content={data.contraindications} />
              <SmpcSection title="Warnings & Precautions" content={data.warnings} />
              <SmpcSection title="Drug Interactions" content={data.interactions} />
              <SmpcSection title="Pregnancy & Lactation" content={data.pregnancy_lactation} />
              <SmpcSection title="Adverse Effects" content={data.adverse_effects} />
              <SmpcSection title="Overdose" content={data.overdose} />
              <SmpcSection title="Storage" content={data.storage} />
              {data.shelf_life && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Shelf Life:</span>{' '}
                  <span className="text-sm">{data.shelf_life}</span>
                </div>
              )}
              {data.source_url && (
                <a
                  href={data.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                >
                  <ExternalLink className="h-3 w-3" /> View original PDF on PPB
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available.</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ──────────────────────────────────────────────────────────────────────

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-40 mt-1" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────

export default function DrugFormularyPage() {
  const [search, setSearch] = useState('');
  const [selectedSmpcId, setSelectedSmpcId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { refresh, isRefreshing } = usePageRefresh();
  const { data: stats } = useFormularyStats();
  const { data, isLoading, isFetching } = useFormularySearch(debouncedSearch);

  const smpcCount = data?.smpc.length ?? 0;
  const ppbCount = data?.ppb_products.length ?? 0;
  const kemlCount = data?.keml.length ?? 0;
  const hasResults = (data?.total_results ?? 0) > 0;
  const hasQuery = debouncedSearch.length >= 2;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Drug Formulary"
          helpContent="Search Kenya's pharmaceutical data sources — SmPC monographs (PPB), product registrations, and the Kenya Essential Medicines List (KEML). Data sourced from the Pharmacy & Poisons Board."
        />

        {/* Stats bar */}
        {stats?.loaded && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-blue-500" />
              {stats.smpc_count.toLocaleString()} SmPC monographs
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              {stats.ppb_products_count.toLocaleString()} PPB products
            </span>
            <span className="inline-flex items-center gap-1">
              <Pill className="h-3 w-3 text-purple-500" />
              {stats.keml_count.toLocaleString()} KEML entries
            </span>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drugs by name, ingredient, or trade name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {isFetching && hasQuery && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>

        {/* Error message */}
        {data?.error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {data.error}
          </div>
        )}

        {/* Results */}
        {hasQuery && (
          <>
            {isLoading ? (
              <ResultsSkeleton />
            ) : hasResults ? (
              <Tabs defaultValue="smpc" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="smpc" className="gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                    <span className="sm:hidden">SmPC</span>
                    <span className="hidden sm:inline">SmPC</span>
                    {smpcCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {smpcCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="ppb" className="gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="sm:hidden">PPB</span>
                    <span className="hidden sm:inline">PPB Products</span>
                    {ppbCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {ppbCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="keml" className="gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-purple-500" />
                    <span>KEML</span>
                    {kemlCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {kemlCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="smpc" className="mt-4 space-y-3">
                  {smpcCount === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No SmPC results for &ldquo;{debouncedSearch}&rdquo;
                    </p>
                  ) : (
                    data!.smpc.map((item) => (
                      <SmpcCard key={item.id} item={item} onViewDetail={setSelectedSmpcId} />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="ppb" className="mt-4 space-y-3">
                  {ppbCount === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No PPB product results for &ldquo;{debouncedSearch}&rdquo;
                    </p>
                  ) : (
                    data!.ppb_products.map((item) => (
                      <PpbProductCard key={item.registration_no} item={item} />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="keml" className="mt-4 space-y-3">
                  {kemlCount === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No KEML results for &ldquo;{debouncedSearch}&rdquo;
                    </p>
                  ) : (
                    data!.keml.map((item) => (
                      <KemlCard key={item.code} item={item} />
                    ))
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-8">
                <Pill className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No results found for &ldquo;{debouncedSearch}&rdquo;
                </p>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!hasQuery && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-medium mb-1">Search the Formulary</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Search across SmPC clinical monographs, PPB product registrations, and the Kenya Essential Medicines List.
                Enter at least 2 characters to begin.
              </p>
            </CardContent>
          </Card>
        )}

        {/* SmPC Detail Modal */}
        <SmpcDetailModal
          docId={selectedSmpcId}
          open={!!selectedSmpcId}
          onClose={() => setSelectedSmpcId(null)}
        />
      </div>
    </PullToRefresh>
  );
}
