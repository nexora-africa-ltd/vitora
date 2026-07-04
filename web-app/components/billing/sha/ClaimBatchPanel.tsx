/**
 * ClaimBatchPanel — Batch validation and bulk submission UI.
 *
 * Renders a panel that lets billing staff:
 * 1. Validate all draft claims in one click
 * 2. See which claims are ready, invalid, or missing documents
 * 3. Bulk-submit all valid claims
 */
'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  Send,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { shaApi } from '@/lib/api/sha';
import type { BatchValidationResult, BulkSubmitResult } from '@/lib/api/sha';

export function ClaimBatchPanel() {
  const [validationResult, setValidationResult] = useState<BatchValidationResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: () => shaApi.batchValidateClaims(),
    onSuccess: (data) => {
      setValidationResult(data);
      if (data.ready > 0) {
        toast.success(`${data.ready} claim(s) ready for submission`);
      } else {
        toast.info('No claims ready for submission');
      }
    },
    onError: () => {
      toast.error('Batch validation failed');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (ids: number[]) => shaApi.bulkSubmitClaims(ids),
    onSuccess: (data: BulkSubmitResult) => {
      toast.success(
        `${data.submitted} claim(s) submitted, ${data.failed} failed, ${data.skipped} skipped`
      );
      // Reset validation result
      setValidationResult(null);
    },
    onError: () => {
      toast.error('Bulk submission failed');
    },
  });

  const handleBulkSubmit = () => {
    if (!validationResult?.ready_claims.length) return;
    const ids = validationResult.ready_claims.map((c) => c.id);
    submitMutation.mutate(ids);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Batch Claims Processing</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
          >
            {validateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Validate All Drafts
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!validationResult && !validateMutation.isPending && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Validate All Drafts&quot; to check which claims are ready for submission.
          </p>
        )}

        {validateMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validating claims...
          </div>
        )}

        {validationResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 rounded-md border p-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Ready</p>
                  <p className="font-semibold">{validationResult.ready}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Invalid</p>
                  <p className="font-semibold">{validationResult.invalid}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <FileWarning className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Missing Docs</p>
                  <p className="font-semibold">{validationResult.missing_docs}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <Send className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-semibold text-xs">
                    KES {Number(validationResult.total_claimable_amount).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Ready claims */}
            {validationResult.ready_claims.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-green-700 dark:text-green-400">
                    Ready for submission ({validationResult.ready})
                  </h4>
                  <Button
                    size="sm"
                    onClick={handleBulkSubmit}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Submit All ({validationResult.ready})
                  </Button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {validationResult.ready_claims.slice(0, 10).map((claim) => (
                    <div
                      key={claim.id}
                      className="flex justify-between text-xs py-1 px-2 rounded bg-green-50 dark:bg-green-900/20"
                    >
                      <span>{claim.claim_number} — {claim.patient_name}</span>
                      <span className="font-medium">
                        KES {Number(claim.claimed_amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {validationResult.ready_claims.length > 10 && (
                    <p className="text-xs text-muted-foreground pl-2">
                      +{validationResult.ready_claims.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Invalid claims */}
            {validationResult.invalid_claims.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                  Validation errors ({validationResult.invalid})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {validationResult.invalid_claims.slice(0, 5).map((claim) => (
                    <div
                      key={claim.id}
                      className="text-xs py-1 px-2 rounded bg-red-50 dark:bg-red-900/20"
                    >
                      <span className="font-medium">{claim.claim_number}</span>
                      <span className="text-muted-foreground ml-1">
                        {claim.errors[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing docs claims */}
            {validationResult.missing_docs_claims.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                  Missing documents ({validationResult.missing_docs})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {validationResult.missing_docs_claims.slice(0, 5).map((claim) => (
                    <div
                      key={claim.id}
                      className="text-xs py-1 px-2 rounded bg-amber-50 dark:bg-amber-900/20"
                    >
                      <span className="font-medium">{claim.claim_number}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {claim.missing_documents.map((doc, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
