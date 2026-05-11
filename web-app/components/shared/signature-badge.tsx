'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  FileSignature,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { signaturesApi } from '@/lib/api/certificates';
import { toast } from 'sonner';
import type { DocumentSignature, SignatureVerificationResult } from '@/lib/types/security';

interface SignatureBadgeProps {
  /** The document model type (e.g., 'LabResult', 'Prescription') */
  documentType: string;
  /** The document's primary key */
  documentId: number;
  /** Whether the current user can sign this document */
  canSign?: boolean;
}

/**
 * Reusable badge that shows the digital signature status of a clinical document.
 *
 * - Unsigned: shows "Unsigned" badge with optional "Sign" button
 * - Signed: shows "Signed" badge with signer info
 * - Clickable: opens verification dialog with full details
 */
export function SignatureBadge({ documentType, documentId, canSign = false }: SignatureBadgeProps) {
  const queryClient = useQueryClient();
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState<SignatureVerificationResult | null>(null);

  const {
    data: signatures,
    isLoading,
  } = useQuery<DocumentSignature[]>({
    queryKey: ['document-signatures', documentType, documentId],
    queryFn: () => signaturesApi.forDocument(documentType, documentId),
  });

  const signMutation = useMutation({
    mutationFn: () => signaturesApi.sign({ document_type: documentType, document_id: documentId }),
    onSuccess: () => {
      toast.success('Document signed.');
      queryClient.invalidateQueries({
        queryKey: ['document-signatures', documentType, documentId],
      });
    },
    onError: (err: unknown) => {
      // Extract error message from API response
      let message = 'Failed to sign document.';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: Record<string, unknown> } }).response;
        const d = resp?.data;
        if (d) {
          if (typeof d.error === 'string') message = d.error;
          else if (typeof d.detail === 'string') message = d.detail;
          else if (typeof d.message === 'string') message = d.message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (sigId: number) => signaturesApi.verify(sigId),
    onSuccess: (result) => {
      setVerificationResult(result);
    },
    onError: () => {
      toast.error('Failed to verify signature.');
    },
  });

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  const latestSig = signatures && signatures.length > 0 ? signatures[0] : null;

  if (!latestSig) {
    // Unsigned state
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-muted-foreground">
          Unsigned
        </Badge>
        {canSign && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => signMutation.mutate()}
            disabled={signMutation.isPending}
            className="h-6 text-xs"
          >
            {signMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <FileSignature className="h-3 w-3 mr-1" />
            )}
            Sign
          </Button>
        )}
      </div>
    );
  }

  // Signed state
  return (
    <>
      <button
        onClick={() => {
          setVerifyDialogOpen(true);
          verifyMutation.mutate(latestSig.id);
        }}
        className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <Badge className="bg-green-100 text-green-700 border-green-300 hover:bg-green-200">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Signed
        </Badge>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          by {latestSig.signer_full_name || latestSig.signer_username}
        </span>
      </button>

      {/* Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Signature Verification</DialogTitle>
              <HelpPopover content="Verifies the cryptographic digital signature: checks certificate validity, content integrity, and RSA signature." />
            </div>
          </DialogHeader>

          {verifyMutation.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Verifying...</span>
            </div>
          ) : verificationResult ? (
            <div className="space-y-4 py-2">
              {/* Overall Status */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {verificationResult.valid ? (
                  <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-8 w-8 text-destructive shrink-0" />
                )}
                <div>
                  <p className="font-semibold">
                    {verificationResult.valid ? 'Signature Valid' : 'Signature Invalid'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {verificationResult.details}
                  </p>
                </div>
              </div>

              {/* Checks */}
              <div className="space-y-2 text-sm">
                <VerifyCheck label="Certificate Valid" passed={verificationResult.certificate_valid} />
                <VerifyCheck label="Content Integrity" passed={verificationResult.content_match} />
                <VerifyCheck label="RSA Signature" passed={verificationResult.signature_match} />
              </div>

              {/* Signer Info */}
              <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                <div>
                  <span className="text-muted-foreground text-xs">Signer</span>
                  <p className="font-medium">{verificationResult.signer}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Signed At</span>
                  <p className="font-medium">
                    {new Date(verificationResult.signed_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Signature Details */}
              <div className="text-xs space-y-1 border-t pt-3">
                <p className="text-muted-foreground">Content Hash (SHA-256)</p>
                <p className="font-mono break-all bg-muted p-1.5 rounded text-[10px]">
                  {latestSig.content_hash}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VerifyCheck({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {passed ? (
        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
      )}
      <span className={passed ? 'text-foreground' : 'text-destructive'}>{label}</span>
    </div>
  );
}
