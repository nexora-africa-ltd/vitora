'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpPopover } from '@/components/shared/help-popover';
import { surveillanceApi } from '@/lib/api/surveillance';
import { toast } from '@/lib/hooks/use-toast';

interface DHIS2PreviewDialogProps {
  reportId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DHIS2PreviewDialog({ reportId, open, onOpenChange }: DHIS2PreviewDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['idsr-dhis2-preview', reportId],
    queryFn: () => surveillanceApi.getDHIS2Preview(reportId),
    enabled: open,
  });

  const payloadString = data ? JSON.stringify(data.payload, null, 2) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payloadString);
      toast({
        title: 'Copied',
        description: 'DHIS2 payload copied to clipboard.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Unable to copy payload.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>DHIS2 Payload Preview</DialogTitle>
            <HelpPopover content="Preview the data being sent to DHIS2/KHIS before submission." />
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <ScrollArea className="h-[320px] rounded-md border bg-muted/20">
            <pre className="p-4 text-xs whitespace-pre-wrap break-words">
              {payloadString}
            </pre>
          </ScrollArea>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button onClick={handleCopy} disabled={!payloadString}>
            Copy JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
