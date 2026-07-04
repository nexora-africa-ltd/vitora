/**
 * AutoAttachDocumentsButton — One-click document auto-attachment.
 *
 * Scans the encounter for digital documents (lab results, prescriptions,
 * clinical notes) and attaches them to the SHA claim automatically.
 */
'use client';

import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Paperclip, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { shaApi } from '@/lib/api/sha';

interface AutoAttachDocumentsButtonProps {
  claimId: number;
  onAttached?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'default';
}

export function AutoAttachDocumentsButton({
  claimId,
  onAttached,
  variant = 'outline',
  size = 'sm',
}: AutoAttachDocumentsButtonProps) {
  const mutation = useMutation({
    mutationFn: () => shaApi.autoAttachDocuments(claimId),
    onSuccess: (result) => {
      if (result.attached > 0) {
        toast.success(`${result.attached} document(s) auto-attached to claim`);
        onAttached?.();
      } else if (result.already_attached) {
        toast.info('All available documents already attached');
      } else {
        toast.info('No digital documents found to attach');
      }
    },
    onError: () => {
      toast.error('Document auto-attachment failed');
    },
  });

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : mutation.isSuccess ? (
        <Check className="h-4 w-4 mr-1 text-green-500" />
      ) : (
        <Paperclip className="h-4 w-4 mr-1" />
      )}
      Auto-Attach Documents
    </Button>
  );
}
