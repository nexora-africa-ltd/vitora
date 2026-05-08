'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { QrCode, RefreshCw, Scan, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { attendanceApi } from '@/lib/api/scheduling';
import { getApiErrorMessage } from '@/lib/api/client';
import { HelpPopover } from '@/components/shared/help-popover';

// =============================================================================
// QR Code Display (for managers)
// =============================================================================

export function QRCodeDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['qr-token'],
    queryFn: () => attendanceApi.getQRToken(),
    enabled: open,
    refetchInterval: open ? 60_000 * 30 : false, // Refresh every 30min when open
  });

  useEffect(() => {
    if (data?.qr_token && canvasRef.current) {
      // Responsive QR size: smaller on mobile
      const size = window.innerWidth < 400 ? 200 : 280;
      QRCode.toCanvas(canvasRef.current, data.qr_token, {
        width: size,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
  }, [data?.qr_token]);

  const validUntil = data?.valid_until
    ? new Date(data.valid_until).toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <QrCode className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">QR Clock-In</span>
          <span className="sm:hidden">QR</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Facility QR Code</DialogTitle>
            <HelpPopover content="Display this QR code at the facility entrance. Staff scan it with the mobile app or scanner to clock in automatically." />
          </div>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="rounded-xl border bg-white p-3 sm:p-4">
            <canvas ref={canvasRef} className="max-w-full h-auto" />
          </div>
          {data && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground text-center">
              <Timer className="h-4 w-4 shrink-0" />
              <span>
                {data.facility_name} · Valid until {validUntil}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// QR Scanner Dialog (for staff)
// =============================================================================

export function QRScannerDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<unknown>(null);

  const clockInMutation = useMutation({
    mutationFn: (qr_token: string) => attendanceApi.qrClockIn({ qr_token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      toast.success('QR Clock-in successful!');
      setOpen(false);
      stopScanner();
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || scannerInstanceRef.current) return;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerInstanceRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          clockInMutation.mutate(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {}, // ignore scan failure
      );
    } catch {
      // Camera not available — user can use manual input
    }
  }, [clockInMutation]);

  const stopScanner = useCallback(() => {
    const scanner = scannerInstanceRef.current as { stop?: () => Promise<void> } | null;
    if (scanner?.stop) {
      scanner.stop().catch(() => {});
      scannerInstanceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Small delay to let the DOM render
      const timer = setTimeout(startScanner, 500);
      return () => clearTimeout(timer);
    }
    stopScanner();
    return undefined;
  }, [open, startScanner, stopScanner]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Scan className="h-4 w-4 mr-1" />
          Scan QR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Scan QR to Clock In</DialogTitle>
            <HelpPopover content="Point your camera at the facility QR code to clock in automatically." />
          </div>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div
            id="qr-reader"
            ref={scannerRef}
            className="w-full max-w-[300px] rounded-lg overflow-hidden"
          />
          <div className="w-full space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Or enter the code manually:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="e.g. 1:abc123..."
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (manualInput.trim()) {
                    clockInMutation.mutate(manualInput.trim());
                  }
                }}
                disabled={clockInMutation.isPending || !manualInput.trim()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
