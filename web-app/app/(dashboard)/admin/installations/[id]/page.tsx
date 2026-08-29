'use client';

import { use, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { licensingAdminApi } from '@/lib/api/licensing';
import { organizationsApi } from '@/lib/api/organizations';
import { facilitiesApi } from '@/lib/api/facilities';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Monitor, Calendar, Ban, Pause, Play, Copy, Send, Building } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { InstallationStatus } from '@/lib/types/licensing';

const statusColors: Record<InstallationStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  SUSPENDED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  REVOKED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function InstallationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const installId = parseInt(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSuperuser } = usePermissions();

  const { data: installation, isLoading } = useQuery({
    queryKey: ['admin', 'installations', installId],
    queryFn: () => licensingAdminApi.get(installId),
    enabled: isSuperuser && !isNaN(installId),
  });

  const { data: orgDetail } = useQuery({
    queryKey: ['admin', 'organizations', installation?.organization],
    queryFn: () => organizationsApi.get(installation!.organization),
    enabled: !!installation?.organization,
  });

  const revokeMutation = useMutation({
    mutationFn: () => licensingAdminApi.revoke(installId, 'Admin revocation'),
    onSuccess: () => {
      toast.success('Installation revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'installations'] });
    },
    onError: () => toast.error('Failed to revoke'),
  });

  const suspendMutation = useMutation({
    mutationFn: () => licensingAdminApi.suspend(installId, 'Admin suspension'),
    onSuccess: () => {
      toast.success('Installation suspended');
      queryClient.invalidateQueries({ queryKey: ['admin', 'installations'] });
    },
    onError: () => toast.error('Failed to suspend'),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => licensingAdminApi.reactivate(installId),
    onSuccess: () => {
      toast.success('Installation reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'installations'] });
    },
    onError: () => toast.error('Failed to reactivate'),
  });

  if (!isSuperuser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Superuser access required.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!installation) {
    return <p className="text-muted-foreground">Installation not found.</p>;
  }

  const formatDate = (d: string | null) => (d ? format(new Date(d), 'PPp') : '—');

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={
          installation.name ||
          installation.hostname ||
          installation.installation_id ||
          'Unnamed Installation'
        }
        helpContent="View installation details and manage its license status."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {installation.status === 'ACTIVE' && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Pause className="h-4 w-4" />
                      Suspend
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Suspend Installation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will block new writes from this installation. It can be reactivated later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => suspendMutation.mutate()}>
                        Suspend
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <Ban className="h-4 w-4" />
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke License?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently revokes this installation&apos;s license. It cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => revokeMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Revoke
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {installation.status === 'SUSPENDED' && (
              <Button size="sm" className="gap-2" onClick={() => reactivateMutation.mutate()}>
                <Play className="h-4 w-4" />
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {installation.org_name}
            {installation.facility_name && (
              <span className="text-muted-foreground"> • {installation.facility_name}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {installation.installation_id || 'Not yet activated'}
          </p>
        </div>
        <Badge className={`${statusColors[installation.status]} shrink-0 w-fit`}>
          {installation.status}
        </Badge>
      </div>

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" /> Installation Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Version" value={installation.app_version || '—'} />
            <Row label="OS" value={installation.os_info || '—'} />
            <Row label="Hostname" value={installation.hostname || '—'} />
            <Row label="Last IP" value={installation.check_in_ip || '—'} />
            <Row label="Check-ins" value={String(installation.check_in_count || 0)} />
            <Row label="Created" value={formatDate(installation.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Activated" value={formatDate(installation.activated_at)} />
            <Row label="Last Check-in" value={formatDate(installation.last_check_in)} />
            {installation.revoked_at && (
              <Row label="Revoked" value={formatDate(installation.revoked_at)} />
            )}
            {installation.revoked_reason && (
              <Row label="Reason" value={installation.revoked_reason} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrity & Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Hardware fingerprint" value={installation.hardware_fingerprint || '—'} />
            <Row label="Binary manifest ID" value={installation.binary_manifest_id || '—'} />
            <Row label="Monotonic counter" value={String(installation.revocation_epoch ?? 0)} />
            <Row
              label="Last reported hashes"
              value={String(Object.keys(installation.last_reported_hashes || {}).length)}
            />
            <Row label="Tamper flagged at" value={formatDate(installation.tamper_flagged_at)} />
            <Row label="Tamper resolved at" value={formatDate(installation.tamper_resolved_at)} />
          </CardContent>
        </Card>
      </div>

      {/* Facility Link */}
      <FacilityLinkCard
        installationId={installation.id}
        currentFacilityId={installation.facility}
        currentFacilityName={installation.facility_name}
        organizationId={installation.organization}
      />

      {/* Activation code (if pending) */}
      {installation.status === 'PENDING' && installation.activation_code && (
        <ActivationCodeCard
          installationId={installation.id}
          code={installation.activation_code}
          orgEmail={orgDetail?.contact_email}
          orgName={installation.org_name}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function ActivationCodeCard({
  installationId,
  code,
  orgEmail,
  orgName,
}: {
  installationId: number;
  code: string;
  orgEmail?: string;
  orgName: string;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  const sendMutation = useMutation({
    mutationFn: (payload: { to_email: string; subject?: string }) =>
      licensingAdminApi.sendCode(installationId, payload),
    onSuccess: (data) => {
      toast.success(`Activation code emailed to ${data.sent_to}`);
      setComposeOpen(false);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Failed to send email');
    },
  });

  const openCompose = () => {
    setEmailTo(orgEmail || '');
    setEmailSubject(`Vitora HMIS Activation Code — ${orgName}`);
    setComposeOpen(true);
  };

  const copyToClipboard = () => {
    // Use a hidden input + execCommand for maximum compatibility
    if (codeRef.current) {
      codeRef.current.select();
      codeRef.current.setSelectionRange(0, 99999);
      document.execCommand('copy');
      toast.success('Activation code copied to clipboard');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activation Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hidden input for reliable copy */}
          <input
            ref={codeRef}
            value={code}
            readOnly
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <code className="text-lg font-mono bg-muted px-3 py-2 rounded block text-center select-all">
            {code}
          </code>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={copyToClipboard}
            >
              <Copy className="h-4 w-4" />
              Copy Code
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openCompose}
            >
              <Send className="h-4 w-4" />
              Email to Organization
            </Button>
          </div>
          {orgEmail && (
            <p className="text-xs text-muted-foreground text-center">
              Default recipient: {orgEmail}
            </p>
          )}
          {!orgEmail && (
            <p className="text-xs text-destructive text-center">
              Organization has no contact email configured — you can enter one manually.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Compose Email Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Activation Code</DialogTitle>
            <DialogDescription>
              The email uses our branded activation template with step-by-step instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">Recipient</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject (optional)</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Vitora HMIS Activation Code"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The activation code <span className="font-mono font-semibold">{code}</span> and
              setup instructions will be included automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendMutation.mutate({
                  to_email: emailTo,
                  subject: emailSubject || undefined,
                })
              }
              disabled={sendMutation.isPending || !emailTo}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMutation.isPending ? 'Sending...' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FacilityLinkCard({
  installationId,
  currentFacilityId,
  currentFacilityName,
  organizationId,
}: {
  installationId: number;
  currentFacilityId: number | null;
  currentFacilityName: string;
  organizationId: number;
}) {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(
    currentFacilityId ? String(currentFacilityId) : '',
  );
  const queryClient = useQueryClient();

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities', { organization: organizationId }],
    queryFn: () => facilitiesApi.list({ organization: organizationId, page_size: 100 }),
  });

  const linkMutation = useMutation({
    mutationFn: (facilityId: number) =>
      licensingAdminApi.patch(installationId, { facility: facilityId }),
    onSuccess: () => {
      toast.success('Facility linked to installation');
      queryClient.invalidateQueries({ queryKey: ['admin', 'installations'] });
    },
    onError: () => toast.error('Failed to link facility'),
  });

  const facilities = facilitiesData?.results || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building className="h-4 w-4" /> Facility
        </CardTitle>
      </CardHeader>
      <CardContent>
        {currentFacilityId ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{currentFacilityName}</span>
            <Badge variant="outline">Linked</Badge>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              No facility linked. The hub activation will fail without a facility.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
                <SelectTrigger className="sm:w-[280px]">
                  <SelectValue placeholder="Select a facility..." />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedFacilityId || linkMutation.isPending}
                onClick={() => linkMutation.mutate(Number(selectedFacilityId))}
              >
                {linkMutation.isPending ? 'Linking...' : 'Link Facility'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
