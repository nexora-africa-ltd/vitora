'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface QRScannerDialogProps {
  /** Called with the decoded MRN when scan succeeds */
  onScan: (mrn: string) => void;
  /** Button label override */
  label?: string;
}

/**
 * QR scanner dialog using the device camera.
 * Decodes Vitora patient QR codes (format: VITORA:MRN:{mrn}).
 */
export function QRScannerDialog({ onScan, label }: QRScannerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const containerRef = useRef<string>('qr-scanner-' + Math.random().toString(36).slice(2, 9));

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // Only stop if scanner is actively scanning (state 2 = SCANNING)
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch {
        // Scanner may already be stopped
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setError(null);
    setScanning(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(containerRef.current);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // Parse Vitora QR format: VITORA:MRN:{mrn}
          const match = decodedText.match(/^VITORA:MRN:(.+)$/);
          if (match?.[1]) {
            onScan(match[1]);
            stopScanner();
            setOpen(false);
          } else {
            // Try as plain MRN (fallback for manually created QR codes)
            if (decodedText.startsWith('MRN-')) {
              onScan(decodedText);
              stopScanner();
              setOpen(false);
            } else {
              setError('Invalid QR code. Expected a Vitora patient QR code.');
            }
          }
        },
        () => {
          // QR code not detected in this frame — ignore
        }
      );
    } catch (err) {
      setScanning(false);
      if (err instanceof Error) {
        if (err.message.includes('NotAllowedError') || err.message.includes('Permission')) {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else if (err.message.includes('NotFoundError')) {
          setError('No camera found on this device.');
        } else {
          setError(`Scanner error: ${err.message}`);
        }
      } else {
        setError('Failed to start camera. Please try again.');
      }
    }
  }, [onScan, stopScanner]);

  // Start scanner when dialog opens, stop when it closes
  useEffect(() => {
    if (open) {
      // Small delay to let the DOM element render
      const timer = setTimeout(startScanner, 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
      return undefined;
    }
  }, [open, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <ScanLine className="mr-2 h-4 w-4" />
          {label ?? 'Scan QR'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan Patient QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div
            id={containerRef.current}
            className={`w-full overflow-hidden rounded-lg ${scanning ? 'min-h-[280px]' : 'min-h-0'}`}
          />

          {!scanning && !error && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Camera className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Starting camera...
              </p>
            </div>
          )}

          {!scanning && error && (
            <Button variant="outline" onClick={startScanner}>
              <Camera className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Point the camera at the patient&apos;s QR code to check them in.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
