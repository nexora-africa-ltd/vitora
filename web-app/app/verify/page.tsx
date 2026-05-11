/**
 * Public Document Verification Page
 *
 * Allows anyone to verify receipt/invoice authenticity by:
 * 1. Scanning QR code (opens this page with params - auto-verifies)
 * 2. Manually entering document details
 *
 * No authentication required.
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, XCircle, QrCode, FileText, Loader2, Shield, Camera } from 'lucide-react';
import { QRScannerDialog } from '@/components/patients/qr-scanner-dialog';

interface VerificationResult {
  valid: boolean;
  document_type?: string;
  document_number?: string;
  amount?: string;
  date?: string;
  message: string;
  error?: string;
}

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [qrData, setQrData] = useState('');
  const [manualData, setManualData] = useState({
    type: 'RECEIPT',
    number: '',
    amount: '',
    date: '',
    signature: '',
  });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);

  // Auto-verify if URL contains verification params (from QR scan)
  useEffect(() => {
    const type = searchParams.get('type');
    const number = searchParams.get('number');
    const amount = searchParams.get('amount');
    const date = searchParams.get('date');
    const signature = searchParams.get('signature');

    if (type && number && amount && date && signature && !autoVerified) {
      setAutoVerified(true);
      setManualData({ type, number, amount, date, signature });

      // Auto-verify
      const verify = async () => {
        setIsLoading(true);
        try {
          const params = new URLSearchParams({ type, number, amount, date, signature });
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || ''}/api/core/verify/?${params}`
          );
          const data = await response.json();
          setResult(data);
        } catch {
          setResult({
            valid: false,
            message: 'Failed to connect to verification server',
            error: 'Network error',
          });
        } finally {
          setIsLoading(false);
        }
      };
      verify();
    }
  }, [searchParams, autoVerified]);

  const verifyWithQR = async () => {
    if (!qrData.trim()) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ''}/api/core/verify/?qr_data=${encodeURIComponent(qrData)}`
      );
      const data = await response.json();
      setResult(data);
    } catch {
      setResult({
        valid: false,
        message: 'Failed to connect to verification server',
        error: 'Network error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyManual = async () => {
    const { type, number, amount, date, signature } = manualData;
    if (!type || !number || !amount || !date || !signature) return;

    setIsLoading(true);
    setResult(null);

    try {
      const params = new URLSearchParams({
        type,
        number,
        amount,
        date,
        signature,
      });
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ''}/api/core/verify/?${params}`
      );
      const data = await response.json();
      setResult(data);
    } catch {
      setResult({
        valid: false,
        message: 'Failed to connect to verification server',
        error: 'Network error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Document Verification
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Verify the authenticity of Vitora HMIS receipts and invoices
          </p>
        </div>

        {/* Verification Card */}
        <Card>
          <CardHeader>
            <CardTitle>Verify Your Document</CardTitle>
            <CardDescription>
              Scan the QR code on your receipt/invoice or enter the details manually
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr" className="gap-2">
                  <QrCode className="h-4 w-4" />
                  QR Code
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Manual Entry
                </TabsTrigger>
              </TabsList>

              {/* QR Code Tab */}
              <TabsContent value="qr" className="space-y-4 mt-4">
                <QRScannerDialog
                  raw
                  onScan={(text) => {
                    setQrData(text);
                    // Auto-verify after scan
                    setIsLoading(true);
                    setResult(null);
                    fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/core/verify/?qr_data=${encodeURIComponent(text)}`
                    )
                      .then((res) => res.json())
                      .then((data) => setResult(data))
                      .catch(() =>
                        setResult({
                          valid: false,
                          message: 'Failed to connect to verification server',
                          error: 'Network error',
                        })
                      )
                      .finally(() => setIsLoading(false));
                  }}
                  trigger={
                    <Button variant="outline" className="w-full h-11">
                      <Camera className="mr-2 h-4 w-4" />
                      Scan with Camera
                    </Button>
                  }
                />

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or paste QR data</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qr-data">QR Code Data</Label>
                  <Textarea
                    id="qr-data"
                    placeholder="Paste the QR code content here...&#10;Example: VITORA-RCPT|N:RCP-001|A:1500.00|D:2026-01-22|S:AB12CD34"
                    value={qrData}
                    onChange={(e) => setQrData(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={verifyWithQR}
                  disabled={!qrData.trim() || isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Document'
                  )}
                </Button>
              </TabsContent>

              {/* Manual Entry Tab */}
              <TabsContent value="manual" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-type">Document Type</Label>
                    <Select
                      value={manualData.type}
                      onValueChange={(v) => setManualData({ ...manualData, type: v })}
                    >
                      <SelectTrigger id="doc-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RECEIPT">Receipt</SelectItem>
                        <SelectItem value="INVOICE">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-number">Document Number</Label>
                    <Input
                      id="doc-number"
                      placeholder="RCP-20260122-0001"
                      value={manualData.number}
                      onChange={(e) => setManualData({ ...manualData, number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      placeholder="1500.00"
                      value={manualData.amount}
                      onChange={(e) => setManualData({ ...manualData, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date (YYYY-MM-DD)</Label>
                    <Input
                      id="date"
                      type="date"
                      value={manualData.date}
                      onChange={(e) => setManualData({ ...manualData, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signature">Verification Code</Label>
                  <Input
                    id="signature"
                    placeholder="AB12CD34"
                    value={manualData.signature}
                    onChange={(e) => setManualData({ ...manualData, signature: e.target.value.toUpperCase() })}
                    maxLength={8}
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted-foreground">
                    The 8-character code shown on the document
                  </p>
                </div>

                <Button
                  onClick={verifyManual}
                  disabled={
                    !manualData.number ||
                    !manualData.amount ||
                    !manualData.date ||
                    !manualData.signature ||
                    isLoading
                  }
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Document'
                  )}
                </Button>
              </TabsContent>
            </Tabs>

            {/* Result Display */}
            {result && (
              <div className="mt-6">
                <Alert variant={result.valid ? 'default' : 'destructive'}>
                  {result.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  <AlertTitle className={result.valid ? 'text-green-600' : ''}>
                    {result.valid ? 'Document Verified' : 'Verification Failed'}
                  </AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">{result.message}</p>
                    {result.document_number && (
                      <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium">{result.document_type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Number:</span>
                          <span className="font-mono">{result.document_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-medium">KES {result.amount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date:</span>
                          <span>{result.date}</span>
                        </div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Section */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p className="mb-2">
            This verification service confirms that a document was issued by Vitora HMIS
            and has not been tampered with.
          </p>
          <p>
            For support, contact your healthcare facility.
          </p>
        </div>
      </div>
    </div>
  );
}
