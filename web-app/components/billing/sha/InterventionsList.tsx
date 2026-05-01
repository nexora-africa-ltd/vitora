/**
 * InterventionsList — Displays claim interventions with Retire/Restore actions.
 *
 * Shows active and retired interventions. Staff can retire active interventions
 * or restore previously retired ones per DHA HIE lifecycle.
 */
'use client';

import React, { useState } from 'react';
import { Archive, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';

interface Intervention {
  id: number;
  intervention_code: string;
  intervention_name: string;
  benefit_code: string;
  status: 'active' | 'retired';
  required_document_types: string[];
  dha_intervention_id?: string;
  tariff_amount?: string | null;
}

interface InterventionsListProps {
  claimId: number;
  interventions: Intervention[];
  /** Called after a retire/restore action so the parent can refetch. */
  onChange?: () => void;
}

export function InterventionsList({ claimId, interventions, onChange }: InterventionsListProps) {
  const { toast } = useToast();
  const [busyCode, setBusyCode] = useState<string | null>(null);

  if (!interventions || interventions.length === 0) {
    return null;
  }

  const activeInterventions = interventions.filter((i) => i.status === 'active');
  const retiredInterventions = interventions.filter((i) => i.status === 'retired');

  async function handleRetire(code: string) {
    setBusyCode(code);
    try {
      await shaApi.ilmRetireIntervention(claimId, { intervention_code: code });
      toast({
        title: 'Intervention retired',
        description: `${code} has been retired from this claim.`,
      });
      onChange?.();
    } catch (e: any) {
      toast({
        title: 'Retire failed',
        description: e?.response?.data?.error ?? e?.message ?? 'Could not retire intervention.',
        variant: 'destructive',
      });
    } finally {
      setBusyCode(null);
    }
  }

  async function handleRestore(code: string) {
    setBusyCode(code);
    try {
      await shaApi.ilmRestoreIntervention(claimId, { intervention_code: code });
      toast({
        title: 'Intervention restored',
        description: `${code} has been restored to this claim.`,
      });
      onChange?.();
    } catch (e: any) {
      toast({
        title: 'Restore failed',
        description: e?.response?.data?.error ?? e?.message ?? 'Could not restore intervention.',
        variant: 'destructive',
      });
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Interventions
          <Badge variant="secondary" className="text-xs">
            {activeInterventions.length} active
          </Badge>
          {retiredInterventions.length > 0 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {retiredInterventions.length} retired
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Active Interventions */}
        {activeInterventions.map((intervention) => (
          <div
            key={intervention.id}
            className="flex items-center justify-between p-3 rounded-md border bg-card"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">
                  {intervention.intervention_code}
                </span>
                <Badge variant="default" className="text-[10px] h-5">
                  Active
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {intervention.intervention_name}
              </p>
              {intervention.tariff_amount && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tariff: KES {parseFloat(intervention.tariff_amount).toLocaleString()}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 ml-2 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/20"
              disabled={busyCode !== null}
              onClick={() => handleRetire(intervention.intervention_code)}
            >
              {busyCode === intervention.intervention_code ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5 mr-1.5" />
              )}
              Retire
            </Button>
          </div>
        ))}

        {/* Retired Interventions */}
        {retiredInterventions.length > 0 && (
          <>
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Retired</p>
            </div>
            {retiredInterventions.map((intervention) => (
              <div
                key={intervention.id}
                className="flex items-center justify-between p-3 rounded-md border border-dashed bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-muted-foreground line-through">
                      {intervention.intervention_code}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                      Retired
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {intervention.intervention_name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 ml-2"
                  disabled={busyCode !== null}
                  onClick={() => handleRestore(intervention.intervention_code)}
                >
                  {busyCode === intervention.intervention_code ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Restore
                </Button>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
