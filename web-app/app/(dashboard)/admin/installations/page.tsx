'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { licensingAdminApi } from '@/lib/api/licensing';
import { organizationsApi } from '@/lib/api/organizations';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Plus, Monitor, Clock, WifiOff, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import type { InstallationListItem, InstallationStatus } from '@/lib/types/licensing';

const statusColors: Record<InstallationStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  SUSPENDED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  REVOKED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const statusIcons: Record<InstallationStatus, typeof Monitor> = {
  PENDING: Clock,
  ACTIVE: CheckCircle2,
  SUSPENDED: WifiOff,
  REVOKED: Ban,
};

export default function InstallationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSuperuser } = usePermissions();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [installName, setInstallName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'installations', search],
    queryFn: () => licensingAdminApi.list({ search: search || undefined }),
    enabled: isSuperuser,
  });

  const { data: orgsData } = useQuery({
    queryKey: ['admin', 'organizations-select'],
    queryFn: () => organizationsApi.list({ page_size: 200 }),
    enabled: isSuperuser && generateOpen,
  });

  const orgOptions = (orgsData?.results ?? []).map((org) => ({
    value: String(org.id),
    label: org.name,
    sublabel: org.county_name ?? undefined,
  }));

  const generateMutation = useMutation({
    mutationFn: (data: { organization_id: number; name?: string }) =>
      licensingAdminApi.generateCode(data),
    onSuccess: (result) => {
      toast.success('Activation code generated', {
        description: result.activation_code,
        duration: 15000,
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'installations'] });
      setGenerateOpen(false);
      setOrgId('');
      setInstallName('');
    },
    onError: () => toast.error('Failed to generate code'),
  });

  if (!isSuperuser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Superuser access required.</p>
      </div>
    );
  }

  const installations = data?.results ?? [];
  const stats = {
    total: data?.count ?? 0,
    active: installations.filter((i) => i.status === 'ACTIVE').length,
    pending: installations.filter((i) => i.status === 'PENDING').length,
    suspended: installations.filter((i) => i.status === 'SUSPENDED').length,
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Installations"
          helpContent="Manage licensed Vitora installations. Generate activation codes, monitor check-ins, and revoke/suspend licenses."
          actions={
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Generate Code</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Activation Code</DialogTitle>
                  <DialogDescription>
                    Create a one-time code for a new installation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <SearchableSelect
                      options={orgOptions}
                      value={orgId}
                      onValueChange={setOrgId}
                      placeholder="Select organization..."
                      searchPlaceholder="Search organizations..."
                      emptyMessage="No organizations found."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="install-name">Installation Name (optional)</Label>
                    <Input
                      id="install-name"
                      value={installName}
                      onChange={(e) => setInstallName(e.target.value)}
                      placeholder="e.g. Reception Desk 1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() =>
                      generateMutation.mutate({
                        organization_id: parseInt(orgId),
                        name: installName || undefined,
                      })
                    }
                    disabled={!orgId || generateMutation.isPending}
                  >
                    {generateMutation.isPending ? 'Generating...' : 'Generate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.suspended}</p>
              <p className="text-xs text-muted-foreground">Suspended</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search installations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <ResponsiveTable
          data={installations}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          onRowClick={(item) => router.push(`/admin/installations/${item.id}`)}
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (item) => (
                <div>
                  <p className="font-medium">{item.name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground">{item.org_name}</p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => {
                const Icon = statusIcons[item.status];
                return (
                  <Badge className={`${statusColors[item.status]} gap-1`}>
                    <Icon className="h-3 w-3" />
                    {item.status}
                  </Badge>
                );
              },
            },
            {
              key: 'last_check_in',
              header: 'Last Check-in',
              sortable: true,
              sortType: 'date' as const,
              hideOnMobile: true,
              cell: (item) =>
                item.last_check_in
                  ? formatDistanceToNow(new Date(item.last_check_in), { addSuffix: true })
                  : '—',
            },
            {
              key: 'app_version',
              header: 'Version',
              hideOnMobile: true,
              cell: (item) => item.app_version || '—',
            },
          ]}
          mobileCard={(item) => {
            const Icon = statusIcons[item.status];
            return (
              <Card className="p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{item.name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-foreground">{item.org_name}</p>
                  </div>
                  <Badge className={`${statusColors[item.status]} gap-1 shrink-0`}>
                    <Icon className="h-3 w-3" />
                    {item.status}
                  </Badge>
                </div>
                {item.last_check_in && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last check-in: {formatDistanceToNow(new Date(item.last_check_in), { addSuffix: true })}
                  </p>
                )}
              </Card>
            );
          }}
        />
      </div>
    </PullToRefresh>
  );
}
