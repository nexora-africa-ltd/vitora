/**
 * InterventionsList — Displays claim interventions with Retire/Restore/Transfer actions.
 *
 * Shows active and retired interventions. Staff can retire active interventions,
 * restore previously retired ones, or transfer (switch) to a new intervention
 * per DHA HIE lifecycle (retire old + add new in one wizard).
 */
'use client';

import React, { useState } from 'react';
import { Archive, ArrowRightLeft, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  payment_mechanism?: string;
  is_per_diem?: boolean;
  level2_tariff?: string | null;
  level3_tariff?: string | null;
  level4_tariff?: string | null;
  level5_tariff?: string | null;
  level6_tariff?: string | null;
}

interface InterventionsListProps {
  claimId: number;
  interventions: Intervention[];
  /** Facility KEPH level (2-6). Used for tariff pre-validation. */
  facilityLevel?: number;
  /** Called after a retire/restore action so the parent can refetch. */
  onChange?: () => void;
}

export function InterventionsList({ claimId, interventions, facilityLevel, onChange }: InterventionsListProps) {
  const { toast } = useToast();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  if (!interventions || interventions.length === 0) {
    return null;
  }

  const activeInterventions = interventions.filter((i) => i.status === 'active');
  const retiredInterventions = interventions.filter((i) => i.status === 'retired');

  /** Check if a per-diem intervention has a tariff for the facility's KEPH level */
  function getMissingTariffWarning(intervention: Intervention): string | null {
    if (!intervention.is_per_diem || !facilityLevel) return null;
    const tariffMap: Record<number, string | null | undefined> = {
      2: intervention.level2_tariff,
      3: intervention.level3_tariff,
      4: intervention.level4_tariff,
      5: intervention.level5_tariff,
      6: intervention.level6_tariff,
    };
    const tariff = tariffMap[facilityLevel];
    if (!tariff) {
      return `No per-diem tariff defined for Level ${facilityLevel}. Claim submission will fail.`;
    }
    return null;
  }

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

  async function handleTransfer() {
    if (!transferFrom || !transferTo.trim()) return;
    setTransferBusy(true);
    try {
      // Step 1: Retire old intervention
      await shaApi.ilmRetireIntervention(claimId, { intervention_code: transferFrom });
      // Step 2: Add new intervention
      await shaApi.ilmAddIntervention(claimId, { intervention_code: transferTo.trim() });
      toast({
        title: 'Intervention transferred',
        description: `Switched from ${transferFrom} to ${transferTo.trim()}.`,
      });
      setTransferFrom(null);
      setTransferTo('');
      onChange?.();
    } catch (e: any) {
      toast({
        title: 'Transfer failed',
        description: e?.response?.data?.error ?? e?.message ?? 'Could not complete transfer.',
        variant: 'destructive',
      });
    } finally {
      setTransferBusy(false);
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
              {(() => {
                const warning = getMissingTariffWarning(intervention);
                return warning ? (
                  <p className="text-xs text-destructive mt-0.5 font-medium">{warning}</p>
                ) : null;
              })()}
            </div>
            <div className="flex gap-1.5 shrink-0 ml-2">
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
                disabled={busyCode !== null}
                onClick={() => {
                  setTransferFrom(intervention.intervention_code);
                  setTransferTo('');
                }}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                Transfer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/20"
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

      {/* Transfer Intervention Dialog */}
      <Dialog open={transferFrom !== null} onOpenChange={(open) => { if (!open) setTransferFrom(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Intervention</DialogTitle>
            <DialogDescription>
              This will retire <span className="font-mono font-medium">{transferFrom}</span> and
              add a new intervention in its place. Use this for ward transfers (e.g., General Ward → ICU)
              or procedure upgrades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="transfer-to-code">New intervention code</Label>
              <Input
                id="transfer-to-code"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                placeholder="e.g., SHA-18-001 (ICU)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferFrom(null)}>
              Cancel
            </Button>
            <Button
              disabled={transferBusy || !transferTo.trim()}
              onClick={handleTransfer}
            >
              {transferBusy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
