/**
 * Staff Invitations Management Page
 * Manage pending, accepted, expired, and revoked invitations.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Send,
  RotateCw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Building2,
  Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useToast } from '@/lib/hooks/use-toast';
import { invitationsApi } from '@/lib/api/onboarding';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffInvitation, InvitationStatus } from '@/lib/types/onboarding';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 20;

const statusConfig: Record<InvitationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pending', variant: 'default', icon: Clock },
  ACCEPTED: { label: 'Accepted', variant: 'secondary', icon: CheckCircle2 },
  EXPIRED: { label: 'Expired', variant: 'outline', icon: AlertCircle },
  REVOKED: { label: 'Revoked', variant: 'destructive', icon: XCircle },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelativeExpiry(dateStr: string): string {
  const expiresAt = new Date(dateStr);
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs < 0) return 'Expired';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h left`;
  return 'Less than 1h';
}

export default function InvitationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const { refresh, isRefreshing } = usePageRefresh();

  const [revokeTarget, setRevokeTarget] = useState<StaffInvitation | null>(null);
  const [isActioning, setIsActioning] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invitations', { page, search, status: statusFilter }],
    queryFn: () => invitationsApi.list({
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
  });

  const invitations = data?.results ?? [];
  const pendingCount = invitations.filter(i => i.status === 'PENDING').length;
  const acceptedCount = invitations.filter(i => i.status === 'ACCEPTED').length;
  const expiredCount = invitations.filter(i => i.status === 'EXPIRED').length;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  const handleResend = async (invitation: StaffInvitation) => {
    setIsActioning(invitation.id);
    try {
      await invitationsApi.resend(invitation.id);
      toast({
        title: 'Invitation resent',
        description: `Invitation email resent to ${invitation.email}`,
      });
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to resend',
        description: error instanceof Error ? error.message : 'Could not resend invitation',
      });
    } finally {
      setIsActioning(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsActioning(revokeTarget.id);
    try {
      await invitationsApi.revoke(revokeTarget.id);
      toast({
        title: 'Invitation revoked',
        description: `Invitation to ${revokeTarget.email} has been revoked`,
      });
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to revoke',
        description: error instanceof Error ? error.message : 'Could not revoke invitation',
      });
    } finally {
      setIsActioning(null);
      setRevokeTarget(null);
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Staff Invitations"
          helpContent="Manage staff invitations. Resend pending invitations or revoke them. Accepted invitations create staff accounts automatically."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/staff">Staff List</Link>
              </Button>
              <Button asChild>
                <Link href="/admin/staff/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite Staff
                </Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Total Invitations"
            value={data?.count ?? 0}
            description="All invitations"
            icon={<Mail className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Pending"
            value={pendingCount}
            description="Awaiting response"
            icon={<Clock className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Accepted"
            value={acceptedCount}
            description="Account created"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Expired"
            value={expiredCount}
            description="Needs resend"
            icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px] sm:items-center mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by email…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as InvitationStatus | 'all'); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="REVOKED">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ResponsiveTable
              data={invitations}
              keyExtractor={(item) => item.id}
              isLoading={isLoading}
              emptyMessage="No invitations found"
              columns={[
                {
                  key: 'email',
                  header: 'Email',
                  sortable: true,
                  cell: (item) => (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.email}</p>
                      {item.job_title && (
                        <p className="text-xs text-muted-foreground">{item.job_title}</p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'organization_name',
                  header: 'Organization',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (item) => (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{item.organization_name}</span>
                    </div>
                  ),
                },
                {
                  key: 'role_name',
                  header: 'Role',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (item) => item.role_name ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {item.role_name}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => {
                    const config = statusConfig[item.status];
                    const StatusIcon = config.icon;
                    return (
                      <Badge variant={config.variant} className="gap-1 shrink-0 w-fit">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    );
                  },
                },
                {
                  key: 'expires_at',
                  header: 'Expiry',
                  sortable: true,
                  sortType: 'date' as const,
                  hideOnMobile: true,
                  cell: (item) => (
                    <span className="text-sm text-muted-foreground">
                      {item.status === 'PENDING' ? formatRelativeExpiry(item.expires_at) : formatDate(item.expires_at)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => (
                    <div className="flex gap-1 justify-end">
                      {item.status === 'PENDING' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleResend(item); }}
                            disabled={isActioning === item.id}
                          >
                            <RotateCw className={`h-3.5 w-3.5 mr-1 ${isActioning === item.id ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Resend</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setRevokeTarget(item); }}
                            disabled={isActioning === item.id}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden sm:inline">Revoke</span>
                          </Button>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(item) => {
                const config = statusConfig[item.status];
                const StatusIcon = config.icon;
                return (
                  <Card className="p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.organization_name}
                          {item.role_name && ` • ${item.role_name}`}
                        </p>
                        {item.job_title && (
                          <p className="text-xs text-muted-foreground">{item.job_title}</p>
                        )}
                      </div>
                      <Badge variant={config.variant} className="gap-1 shrink-0">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    {item.status === 'PENDING' && (
                      <div className="flex gap-2 mt-3 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8"
                          onClick={() => handleResend(item)}
                          disabled={isActioning === item.id}
                        >
                          <RotateCw className={`h-3.5 w-3.5 mr-1 ${isActioning === item.id ? 'animate-spin' : ''}`} />
                          Resend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-destructive hover:text-destructive"
                          onClick={() => setRevokeTarget(item)}
                          disabled={isActioning === item.id}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              }}
            />

            {/* Pagination */}
            {data && data.count > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {Math.ceil(data.count / PAGE_SIZE)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.next}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revoke confirmation dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the invitation to <strong>{revokeTarget?.email}</strong>.
              They will no longer be able to create an account using this link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
}
