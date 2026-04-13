/**
 * Public Displays Hub
 *
 * Centralized page for generating and accessing public display URLs:
 * - Triage queue display (per facility)
 * - Clinic queue display (per clinic)
 *
 * These displays are designed for TV/tablet screens in waiting areas.
 * They require no authentication and expose no PII.
 */
'use client';

import { useState } from 'react';
import { ExternalLink, Monitor, Copy, Check, Stethoscope, Activity } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { useFacility } from '@/lib/context/facility-context';
import { useClinics } from '@/lib/hooks/use-clinics';

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export default function DisplaysPage() {
  const { toast } = useToast();
  const { facility } = useFacility();
  const { data: clinics } = useClinics({ status: 'ACTIVE', page_size: 100 });

  const [selectedClinic, setSelectedClinic] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const baseUrl = getBaseUrl();
  const triageUrl = facility ? `${baseUrl}/triage-display/${facility.id}` : null;
  const clinicUrl = selectedClinic ? `${baseUrl}/queue-display/${selectedClinic}` : null;

  const copyToClipboard = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast({ title: 'Copied', description: 'URL copied to clipboard' });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: 'Error', description: 'Failed to copy URL', variant: 'destructive' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <PageHeader
        title="Public Displays"
        helpContent="Generate URLs for public-facing TV/tablet screens in waiting areas. These displays auto-refresh every 10 seconds and require no login."
      />

      {/* Triage Queue Display */}
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
          aria-hidden="true"
        />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Activity className="h-5 w-5 text-emerald-500" />
            </div>
            Triage Queue Display
          </CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-3">
          <p className="text-sm text-muted-foreground">
            Shows patients waiting for triage with position numbers, status, and assigned room. No patient names or identifiers are shown.
          </p>
          {triageUrl ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">
                {triageUrl}
              </code>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(triageUrl, 'triage')}
                >
                  {copiedId === 'triage' ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copiedId === 'triage' ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" asChild>
                  <a href={triageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Open
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No facility selected.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-xs">No auth required</Badge>
            <Badge variant="outline" className="text-xs">Auto-refreshes 10s</Badge>
            <Badge variant="outline" className="text-xs">No PII</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Clinic Queue Display */}
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
          aria-hidden="true"
        />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Stethoscope className="h-5 w-5 text-blue-500" />
            </div>
            Clinic Queue Display
          </CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-3">
          <p className="text-sm text-muted-foreground">
            Shows the queue for a specific clinic session with queue numbers, call status, and room assignments.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedClinic} onValueChange={setSelectedClinic}>
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue placeholder="Select a clinic" />
              </SelectTrigger>
              <SelectContent>
                {(clinics?.results ?? []).map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id.toString()}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {clinicUrl && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">
                {clinicUrl}
              </code>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(clinicUrl, 'clinic')}
                >
                  {copiedId === 'clinic' ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copiedId === 'clinic' ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" asChild>
                  <a href={clinicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Open
                  </a>
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-xs">No auth required</Badge>
            <Badge variant="outline" className="text-xs">Auto-refreshes 10s</Badge>
            <Badge variant="outline" className="text-xs">No PII</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
