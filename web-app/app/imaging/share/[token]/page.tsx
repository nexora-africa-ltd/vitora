/**
 * Public DICOM Study Share Viewer
 * Phase E: Standalone page for viewing shared DICOM studies via token link.
 *
 * This page lives OUTSIDE the dashboard layout — no authentication required.
 * Access is governed by the share token + optional PIN.
 */
'use client';

import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiBaseUrl } from '@/lib/api/client';
import { Download, Lock, Shield, AlertTriangle, ImageIcon, Layers } from 'lucide-react';

// Dynamic import to avoid SSR issues with Cornerstone WASM modules
const ShareCornerstoneViewer = dynamic(
  () => import('./share-cornerstone-viewer').then((m) => m.ShareCornerstoneViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-black">
        <Skeleton className="w-20 h-20 rounded-full" />
      </div>
    ),
  }
);


interface ShareViewerPageProps {
  params: Promise<{ token: string }>;
}

interface ShareStudyData {
  study_instance_uid: string;
  study_description: string;
  study_date: string;
  modality: string;
  institution_name: string;
  number_of_series: number;
  number_of_instances: number;
  patient_name: string;
  allow_download: boolean;
  series: Array<{
    series_instance_uid: string;
    series_description: string;
    modality: string;
    number_of_instances: number;
    instances: Array<{
      sop_instance_uid: string;
      instance_number: number;
    }>;
  }>;
}

type PageState = 'loading' | 'pin_required' | 'ready' | 'error' | 'expired';

export default function ShareViewerPage({ params }: ShareViewerPageProps) {
  const { token } = use(params);
  const [state, setState] = useState<PageState>('loading');
  const [studyData, setStudyData] = useState<ShareStudyData | null>(null);
  const [pin, setPin] = useState('');
  const [verifiedPin, setVerifiedPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pinError, setPinError] = useState('');

  const baseUrl = getApiBaseUrl();

  const fetchStudy = useCallback(async (pinValue?: string) => {
    try {
      const headers: Record<string, string> = {};
      if (pinValue) {
        headers['X-Share-PIN'] = pinValue;
      }

      const response = await fetch(`${baseUrl}/api/imaging/share/${token}/`, {
        headers,
      });

      if (response.status === 200) {
        const data = await response.json();
        setStudyData(data);
        setState('ready');
        setPinError('');
        if (pinValue) setVerifiedPin(pinValue);
      } else if (response.status === 401) {
        const body = await response.json();
        if (body.code === 'pin_required') {
          setState('pin_required');
          if (pinValue) {
            setPinError('Incorrect PIN. Please try again.');
          }
        } else {
          setState('error');
          setErrorMessage('Access denied');
        }
      } else if (response.status === 410) {
        setState('expired');
        const body = await response.json();
        setErrorMessage(body.error || 'This share link has expired or been revoked.');
      } else {
        setState('error');
        setErrorMessage('Failed to load study');
      }
    } catch {
      setState('error');
      setErrorMessage('Network error. Please try again.');
    }
  }, [baseUrl, token]);

  useEffect(() => {
    fetchStudy();
  }, [fetchStudy]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setState('loading');
    fetchStudy(pin);
  };

  const handleDownload = () => {
    const pinQuery = verifiedPin ? `?pin=${encodeURIComponent(verifiedPin)}` : '';
    window.open(`${baseUrl}/api/imaging/share/${token}/download/${pinQuery}`, '_blank');
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <p className="text-muted-foreground">Loading shared study...</p>
        </div>
      </div>
    );
  }

  if (state === 'pin_required') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Shield className="h-10 w-10 mx-auto text-primary mb-2" />
            <CardTitle>PIN Protected</CardTitle>
            <p className="text-sm text-muted-foreground">
              This study is PIN-protected. Enter the PIN to view.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                  maxLength={8}
                  autoFocus
                />
                {pinError && (
                  <p className="text-xs text-destructive mt-1">{pinError}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={!pin.trim()}>
                <Lock className="h-4 w-4 mr-2" />
                Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Link Expired</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Error</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!studyData) return null;

  // Gather all instance SOPs for the viewer
  const allInstances = studyData.series.flatMap((s) =>
    s.instances.map((inst) => ({
      ...inst,
      seriesUid: s.series_instance_uid,
    }))
  );

  // Build DICOM file URLs for Cornerstone (raw DICOM via share instance endpoint)
  const dicomUrls = allInstances.map((inst) => {
    const params = new URLSearchParams();
    if (verifiedPin) params.set('pin', verifiedPin);
    const qs = params.toString();
    return `${baseUrl}/api/imaging/share/${token}/instance/${inst.sop_instance_uid}/${qs ? `?${qs}` : ''}`;
  });

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="border-b px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {studyData.study_description || 'Shared DICOM Study'}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{studyData.patient_name}</span>
            <span>•</span>
            <Badge variant="secondary">{studyData.modality}</Badge>
            <span>•</span>
            <span>{studyData.study_date}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {studyData.number_of_series} series
            </span>
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" />
              {studyData.number_of_instances} images
            </span>
          </div>
          {studyData.allow_download && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Cornerstone DICOM Viewer */}
      <div className="flex-1 min-h-0 relative">
        {allInstances.length > 0 ? (
          <ShareCornerstoneViewer
            imageUrls={dicomUrls}
            studyDescription={studyData.study_description}
          />
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <Card>
              <CardContent className="py-12 text-center">
                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No viewable images</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This study has no instances available for viewing.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3 text-center text-xs text-muted-foreground shrink-0">
        Shared via Vitora HMIS • {studyData.institution_name || 'Medical Imaging'}
      </div>
    </div>
  );
}
