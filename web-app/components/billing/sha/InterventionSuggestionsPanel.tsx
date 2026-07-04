/**
 * InterventionSuggestionsPanel — Auto-suggest SHA interventions from clinical data.
 *
 * Shows intervention suggestions based on lab orders, prescriptions, and diagnoses
 * recorded on the encounter. Allows one-click attachment to the claim.
 */
'use client';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Lightbulb,
  Plus,
  Check,
  Loader2,
  FlaskConical,
  Pill,
  Stethoscope,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { shaApi } from '@/lib/api/sha';
/** Intervention suggestion from clinical data */
export interface InterventionSuggestion {
  code: string;
  name: string;
  tariff: string | null;
  benefit_package: string;
  source: string;
  source_id: number;
  source_name: string;
  needs_entitlement_check?: boolean;
}

interface InterventionSuggestionsPanelProps {
  claimId: number;
  /** DHA patient ID (CR number) for entitlement verification */
  dhaPatientId?: string;
  /** SHA member ID for utilization lookups */
  shaMemberId?: number;
  onAttached?: () => void;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  lab_order: <FlaskConical className="h-3.5 w-3.5 text-purple-500" />,
  prescription: <Pill className="h-3.5 w-3.5 text-blue-500" />,
  diagnosis: <Stethoscope className="h-3.5 w-3.5 text-green-500" />,
};

export function InterventionSuggestionsPanel({
  claimId,
  dhaPatientId,
  shaMemberId,
  onAttached,
}: InterventionSuggestionsPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [verifiedCodes, setVerifiedCodes] = useState<Set<string>>(new Set());
  const [deniedCodes, setDeniedCodes] = useState<Set<string>>(new Set());
  const [isVerifying, setIsVerifying] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sha', 'intervention-suggestions', claimId],
    queryFn: () => shaApi.suggestInterventions(claimId),
    staleTime: 60 * 1000,
  });

  const attachMutation = useMutation({
    mutationFn: (interventions: InterventionSuggestion[]) =>
      shaApi.attachSuggestedInterventions(claimId, interventions),
    onSuccess: (result: { attached: number; skipped: number }) => {
      toast.success(`${result.attached} intervention(s) attached to claim`);
      setSelected(new Set());
      refetch();
      onAttached?.();
    },
    onError: () => {
      toast.error('Failed to attach interventions');
    },
  });

  const handleAttachSelected = () => {
    if (!data?.suggestions) return;
    const toAttach = data.suggestions.filter((s: InterventionSuggestion) => selected.has(s.code));
    if (toAttach.length === 0) {
      toast.info('Select at least one intervention');
      return;
    }
    attachMutation.mutate(toAttach);
  };

  const handleAttachAll = () => {
    if (!data?.suggestions?.length) return;
    attachMutation.mutate(data.suggestions);
  };

  const toggleSelection = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleVerifyEntitlement = async () => {
    if (!dhaPatientId || !data?.suggestions?.length) {
      toast.info('Patient DHA ID required for entitlement verification');
      return;
    }

    setIsVerifying(true);
    const verified = new Set<string>();
    const denied = new Set<string>();

    // Check utilization for each suggestion (batch, sequential to respect rate limits)
    for (const suggestion of data.suggestions) {
      try {
        const result = await shaApi.ilmUtilization({
          patient_id: dhaPatientId,
          intervention_code: suggestion.code,
          ...(shaMemberId ? { sha_member_id: shaMemberId } : {}),
        });
        // DHA returns utilization data — if not exhausted, mark as verified
        const payload = (result?.data ?? {}) as Record<string, unknown>;
        const isExhausted = payload?.is_exhausted || payload?.remaining_quantity === 0;
        if (isExhausted) {
          denied.add(suggestion.code);
        } else {
          verified.add(suggestion.code);
        }
      } catch {
        // If DHA call fails, don't mark as denied — leave as unverified
      }
    }

    setVerifiedCodes(verified);
    setDeniedCodes(denied);
    setIsVerifying(false);

    const verifiedCount = verified.size;
    const deniedCount = denied.size;
    if (deniedCount > 0) {
      toast.warning(`${verifiedCount} entitled, ${deniedCount} exhausted/denied`);
    } else if (verifiedCount > 0) {
      toast.success(`All ${verifiedCount} interventions verified as entitled`);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing clinical data for intervention suggestions...
        </CardContent>
      </Card>
    );
  }

  if (!data?.suggestions?.length) {
    return null; // Don't show panel when no suggestions
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm">
              Suggested Interventions ({data.count})
            </CardTitle>
          </div>
          <div className="flex gap-2">
            {dhaPatientId && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleVerifyEntitlement}
                disabled={isVerifying || !data?.suggestions?.length}
              >
                {isVerifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                )}
                Verify All
              </Button>
            )}
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAttachSelected}
                disabled={attachMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Selected ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleAttachAll}
              disabled={attachMutation.isPending}
            >
              {attachMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Add All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          These interventions were matched from clinical actions. Verify entitlement before attaching to confirm the patient&apos;s benefit package covers them.
        </p>
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {data.suggestions.map((suggestion: InterventionSuggestion) => (
            <div
              key={suggestion.code}
              className="flex items-start gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={selected.has(suggestion.code)}
                onCheckedChange={() => toggleSelection(suggestion.code)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {SOURCE_ICONS[suggestion.source] || null}
                  <span className="text-xs font-medium truncate">
                    {suggestion.name}
                  </span>
                  {suggestion.needs_entitlement_check && !verifiedCodes.has(suggestion.code) && !deniedCodes.has(suggestion.code) && (
                    <Badge variant="outline" className="text-[9px] px-1 border-amber-300 text-amber-700 dark:text-amber-400">
                      unverified
                    </Badge>
                  )}
                  {verifiedCodes.has(suggestion.code) && (
                    <Badge variant="outline" className="text-[9px] px-1 border-green-300 text-green-700 dark:text-green-400">
                      entitled
                    </Badge>
                  )}
                  {deniedCodes.has(suggestion.code) && (
                    <Badge variant="destructive" className="text-[9px] px-1">
                      exhausted
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] px-1">
                    {suggestion.code}
                  </Badge>
                  {suggestion.tariff && (
                    <span className="text-[10px] text-muted-foreground">
                      KES {Number(suggestion.tariff).toLocaleString()}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    from: {suggestion.source_name}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
