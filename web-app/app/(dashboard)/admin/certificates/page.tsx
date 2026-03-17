'use client';

import { useState } from 'react';
import {
  Award,
  Ban,
  CheckCircle,
  Key,
  Loader2,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { certificatesApi } from '@/lib/api/certificates';
import { toast } from 'sonner';
import type { CertificateAuthority, UserCertificate } from '@/lib/types/security';

function CertStatusBadge({ cert }: { cert: UserCertificate }) {
  if (cert.is_revoked) {
    return <Badge variant="destructive" className="shrink-0 w-fit">Revoked</Badge>;
  }
  if (cert.is_expired) {
    return <Badge variant="outline" className="shrink-0 w-fit text-amber-600 border-amber-300">Expired</Badge>;
  }
  return <Badge className="shrink-0 w-fit bg-green-100 text-green-700 border-green-300">Valid</Badge>;
}

export default function CertificatesPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState<UserCertificate | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [issueValidity, setIssueValidity] = useState('2');
  const [revokeReason, setRevokeReason] = useState('CESSATION');

  const {
    data: casData,
    isLoading: casLoading,
  } = useQuery<CertificateAuthority[]>({
    queryKey: ['certificate-authorities'],
    queryFn: certificatesApi.listCAs,
  });

  const {
    data: certsData,
    isLoading: certsLoading,
  } = useQuery({
    queryKey: ['user-certificates'],
    queryFn: () => certificatesApi.list({ page_size: 100 }),
  });

  const issueMutation = useMutation({
    mutationFn: () =>
      certificatesApi.issue({
        user_id: selectedUserId!,
        validity_years: parseInt(issueValidity, 10),
      }),
    onSuccess: () => {
      toast.success('Certificate issued.');
      queryClient.invalidateQueries({ queryKey: ['user-certificates'] });
      setIssueDialogOpen(false);
      setSelectedUserId(undefined);
    },
    onError: () => {
      toast.error('Failed to issue certificate.');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      certificatesApi.revoke(selectedCert!.id, { reason: revokeReason }),
    onSuccess: () => {
      toast.success('Certificate revoked.');
      queryClient.invalidateQueries({ queryKey: ['user-certificates'] });
      setRevokeDialogOpen(false);
      setSelectedCert(null);
    },
    onError: () => {
      toast.error('Failed to revoke certificate.');
    },
  });

  const cas = casData ?? [];
  const certs = certsData?.results ?? [];
  const validCerts = certs.filter((c) => c.is_valid);
  const revokedCerts = certs.filter((c) => c.is_revoked);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Certificates"
          helpContent="Manage X.509 PKI certificates for document digital signatures. Issue certificates to clinical staff so they can cryptographically sign lab results, prescriptions, and reports. DHA Compliance: Gap #32."
          actions={
            <Button size="sm" onClick={() => setIssueDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Issue Certificate
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Award className="h-4 w-4" />
                CAs
              </div>
              <div className="text-2xl font-bold">
                {casLoading ? <Skeleton className="h-8 w-8" /> : cas.length}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Key className="h-4 w-4" />
                Total Certificates
              </div>
              <div className="text-2xl font-bold">
                {certsLoading ? <Skeleton className="h-8 w-8" /> : certs.length}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Valid
              </div>
              <div className="text-2xl font-bold text-green-600">
                {certsLoading ? <Skeleton className="h-8 w-8" /> : validCerts.length}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <XCircle className="h-4 w-4 text-destructive" />
                Revoked
              </div>
              <div className="text-2xl font-bold text-destructive">
                {certsLoading ? <Skeleton className="h-8 w-8" /> : revokedCerts.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Certificate Authorities */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Certificate Authorities</CardTitle>
              <HelpPopover content="Root CAs that issue user certificates. Initialize via 'python manage.py init_pki_ca'." />
            </div>
          </CardHeader>
          <CardContent>
            {casLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : cas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No Certificate Authority has been set up yet. Please contact your system administrator to initialize the PKI infrastructure.
              </p>
            ) : (
              <div className="space-y-3">
                {cas.map((ca) => (
                  <div
                    key={ca.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="font-medium text-sm truncate">{ca.name}</span>
                        {ca.is_root ? (
                          <Badge variant="outline" className="text-xs">Root</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Intermediate</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {ca.subject_dn} &bull; RSA-{ca.key_size}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      Valid until {new Date(ca.valid_to).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Certificates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Certificates</CardTitle>
          </CardHeader>
          <CardContent>
            {certsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : certs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No certificates issued yet.
              </p>
            ) : (
              <div className="space-y-3">
                {certs.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {cert.user_name || cert.username}
                        </span>
                        <CertStatusBadge cert={cert} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Serial: {cert.serial_number} &bull; CA: {cert.ca_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Valid: {new Date(cert.valid_from).toLocaleDateString()} –{' '}
                        {new Date(cert.valid_to).toLocaleDateString()}
                      </p>
                    </div>
                    {cert.is_valid && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => {
                          setSelectedCert(cert);
                          setRevokeDialogOpen(true);
                        }}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Issue Certificate Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Issue Certificate</DialogTitle>
              <HelpPopover content="Issue an X.509 certificate to a user so they can digitally sign clinical documents." />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Staff Member</Label>
              <StaffSearchCombobox
                value={selectedUserId}
                onSelect={(userId) => setSelectedUserId(userId)}
                placeholder="Select staff member to issue certificate..."
              />
            </div>
            <div>
              <Label htmlFor="validity">Validity (years)</Label>
              <Select value={issueValidity} onValueChange={setIssueValidity}>
                <SelectTrigger id="validity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 year</SelectItem>
                  <SelectItem value="2">2 years</SelectItem>
                  <SelectItem value="3">3 years</SelectItem>
                  <SelectItem value="5">5 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={!selectedUserId || issueMutation.isPending}
            >
              {issueMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Certificate Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Revoke Certificate</DialogTitle>
              <HelpPopover content="Revoked certificates can no longer be used for signing. This action is irreversible." />
            </div>
          </DialogHeader>
          {selectedCert && (
            <div className="space-y-4 py-2">
              <div className="text-sm">
                <p>
                  Revoking certificate for{' '}
                  <strong>{selectedCert.user_name || selectedCert.username}</strong>
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Serial: {selectedCert.serial_number}
                </p>
              </div>
              <div>
                <Label htmlFor="revoke-reason">Reason</Label>
                <Select value={revokeReason} onValueChange={setRevokeReason}>
                  <SelectTrigger id="revoke-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KEY_COMPROMISE">Key Compromise</SelectItem>
                    <SelectItem value="AFFILIATION_CHANGED">Affiliation Changed</SelectItem>
                    <SelectItem value="SUPERSEDED">Superseded</SelectItem>
                    <SelectItem value="CESSATION">Cessation of Operation</SelectItem>
                    <SelectItem value="PRIVILEGE_WITHDRAWN">Privilege Withdrawn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
