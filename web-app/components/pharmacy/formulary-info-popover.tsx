/**
 * Formulary Info Popover — shows KEML level, PPB registration status,
 * and a "View Monograph" button when a drug is selected.
 *
 * Used in the prescription form as an enrichment layer — informational,
 * not interruptive.
 */
'use client';

import { useState } from 'react';
import {
  BookOpen,
  ShieldCheck,
  Pill,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormularySearch, useSmpcDetail } from '@/lib/hooks/use-formulary';
import type { SmpcSummary } from '@/lib/types/formulary';

// ──────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────

interface FormularyInfoPopoverProps {
  /** Drug name to search (generic name preferred) */
  drugName: string;
  /** Optional facility level (1-5) for KEML comparison */
  facilityLevel?: number;
}

// ──────────────────────────────────────────────────────────────────────
// KEML Level Badge
// ──────────────────────────────────────────────────────────────────────

function KemlLevelBadge({ level, description, facilityLevel }: { level: number; description: string; facilityLevel?: number }) {
  const isAboveFacility = facilityLevel != null && level > facilityLevel;
  const colors = isAboveFacility
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';

  return (
    <Badge className={`${colors} shrink-0 w-fit text-xs`}>
      {isAboveFacility && <AlertTriangle className="h-3 w-3 mr-1" />}
      H{level} — {description}
    </Badge>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SmPC Section (collapsible)
// ──────────────────────────────────────────────────────────────────────

function SmpcSection({ title, content }: { title: string; content?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!content) return null;

  const isLong = content.length > 200;
  const displayContent = isLong && !expanded ? content.slice(0, 200) + '…' : content;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{displayContent}</p>
      {isLong && (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SmPC Detail Modal
// ──────────────────────────────────────────────────────────────────────

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
// Main Component
// ──────────────────────────────────────────────────────────────────────

export function FormularyInfoPopover({ drugName, facilityLevel }: FormularyInfoPopoverProps) {
  const [expanded, setExpanded] = useState(false);
  const [smpcModalId, setSmpcModalId] = useState<string | null>(null);
  const { data, isLoading } = useFormularySearch(drugName);

  // Don't render if no drug name or search is still loading with no data
  if (!drugName || drugName.length < 2) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking formulary...
      </div>
    );
  }
  if (!data || data.total_results === 0) return null;

  const firstSmpc = data.smpc[0];
  const firstKeml = data.keml[0];
  const firstPpb = data.ppb_products[0];
  const isAboveFacility = firstKeml && facilityLevel != null && firstKeml.level_of_use > facilityLevel;
  const ppbExpired = firstPpb && (new Date(firstPpb.date_expiry) < new Date() || !firstPpb.is_valid);

  return (
    <>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2">
          {/* Summary line — always visible */}
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 w-full text-left">
              <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium flex-1">Formulary Info</span>
              <div className="flex items-center gap-1.5">
                {firstKeml && (
                  <KemlLevelBadge
                    level={firstKeml.level_of_use}
                    description={firstKeml.level_description}
                    facilityLevel={facilityLevel}
                  />
                )}
                {firstPpb && (
                  <Badge
                    className={`text-xs shrink-0 w-fit ${
                      ppbExpired
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}
                  >
                    {ppbExpired ? 'PPB Expired' : 'PPB Valid'}
                  </Badge>
                )}
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded detail */}
          <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
            {/* KEML info */}
            {firstKeml && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Pill className="h-3 w-3 text-purple-500" />
                  <span className="text-xs font-medium">KEML</span>
                </div>
                <p className="text-xs text-muted-foreground pl-4.5">
                  {firstKeml.name} — {firstKeml.subcategory}
                </p>
                {firstKeml.dose_forms.length > 0 && (
                  <p className="text-xs text-muted-foreground pl-4.5">
                    Forms: {firstKeml.dose_forms.map((df) => {
                      const s = df.strengths?.join(', ') || df.strength || '';
                      return s ? `${df.form} (${s})` : df.form;
                    }).join('; ')}
                  </p>
                )}
                {isAboveFacility && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 pl-4.5 font-medium">
                    ⚠ This drug is above your facility level (H{facilityLevel}). KEML recommends H{firstKeml.level_of_use}+.
                  </p>
                )}
              </div>
            )}

            {/* PPB product info */}
            {firstPpb && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs font-medium">PPB Registration</span>
                </div>
                <p className="text-xs text-muted-foreground pl-4.5">
                  {firstPpb.trade_name} — {firstPpb.manufacturer} ({firstPpb.country_of_origin})
                </p>
                <p className="text-xs text-muted-foreground pl-4.5">
                  Reg: {firstPpb.registration_no} • Expires: {firstPpb.date_expiry} • {firstPpb.category}
                </p>
                {ppbExpired && (
                  <p className="text-xs text-red-700 dark:text-red-400 pl-4.5 font-medium">
                    ⚠ PPB registration has expired. Verify product availability.
                  </p>
                )}
              </div>
            )}

            {/* SmPC quick info + View Monograph button */}
            {firstSmpc && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3 text-blue-500" />
                  <span className="text-xs font-medium">SmPC Monograph</span>
                </div>
                {firstSmpc.contraindications && (
                  <p className="text-xs text-muted-foreground pl-4.5 line-clamp-2">
                    <span className="font-medium">Contraindications:</span> {firstSmpc.contraindications}
                  </p>
                )}
                {firstSmpc.interactions && (
                  <p className="text-xs text-muted-foreground pl-4.5 line-clamp-2">
                    <span className="font-medium">Interactions:</span> {firstSmpc.interactions}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1 ml-4"
                  onClick={() => setSmpcModalId(firstSmpc.id)}
                >
                  <BookOpen className="h-3 w-3" />
                  View Full Monograph
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* SmPC Detail Modal */}
      <SmpcDetailModal
        docId={smpcModalId}
        open={!!smpcModalId}
        onClose={() => setSmpcModalId(null)}
      />
    </>
  );
}
