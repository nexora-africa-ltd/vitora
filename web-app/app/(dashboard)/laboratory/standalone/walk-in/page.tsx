'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, User, Phone, CreditCard, LinkIcon, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { standaloneLisApi } from '@/lib/api/standalone-lis';
import type { WalkInPatient, WalkInPatientCreateData } from '@/lib/types/standalone-lis';
import { toast } from 'sonner';

export default function WalkInPatientsPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['walkin-patients', search],
    queryFn: () => standaloneLisApi.listWalkInPatients({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (data: WalkInPatientCreateData) => standaloneLisApi.createWalkInPatient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkin-patients'] });
      setShowCreate(false);
      toast.success('Walk-in patient registered');
    },
    onError: () => toast.error('Failed to register patient'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => standaloneLisApi.promoteWalkInToPatient(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['walkin-patients'] });
      toast.success(`Promoted to registered patient ${res.mrn}`);
    },
    onError: () => toast.error('Failed to promote walk-in patient'),
  });

  const columns = [
    {
      key: 'registration_number',
      header: 'Reg #',
      sortable: true,
      cell: (item: WalkInPatient) => (
        <span className="font-mono text-sm">{item.registration_number}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortFn: (a: WalkInPatient, b: WalkInPatient) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
      cell: (item: WalkInPatient) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{item.first_name} {item.last_name}</span>
        </div>
      ),
    },
    {
      key: 'national_id',
      header: 'ID',
      cell: (item: WalkInPatient) => item.national_id || '-',
      hideOnMobile: true,
    },
    {
      key: 'phone_number',
      header: 'Phone',
      cell: (item: WalkInPatient) => item.phone_number || '-',
      hideOnMobile: true,
    },
    {
      key: 'linked',
      header: 'Linked',
      cell: (item: WalkInPatient) => (
        item.linked_patient ? (
          <Badge variant="outline" className="text-green-600">
            <LinkIcon className="h-3 w-3 mr-1" /> Linked
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Walk-in</Badge>
        )
      ),
    },
    {
      key: 'created_at',
      header: 'Registered',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: WalkInPatient) => new Date(item.created_at).toLocaleDateString(),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: WalkInPatient) =>
        item.linked_patient ? null : (
          <Button
            size="sm"
            variant="outline"
            disabled={promoteMutation.isPending}
            onClick={() => promoteMutation.mutate(item.id)}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Promote
          </Button>
        ),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Walk-in Patients"
          helpContent="Register and manage walk-in patients for standalone lab orders. Walk-in patients don't require a full HMIS registration."
          actions={
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Register
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Register Walk-in Patient</DialogTitle>
                </DialogHeader>
                <WalkInCreateForm
                  onSubmit={(data) => createMutation.mutate(data)}
                  isLoading={createMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, phone, or registration number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={data?.results || []}
              keyExtractor={(item) => item.id}
              columns={columns}
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              isLoading={isLoading}
              emptyMessage="No walk-in patients registered yet."
            />
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function WalkInCreateForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: WalkInPatientCreateData) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<WalkInPatientCreateData>({
    first_name: '',
    last_name: '',
    gender: '',
    phone_number: '',
    national_id: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            required
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            required
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="gender">Gender</Label>
          <Select
            value={formData.gender || ''}
            onValueChange={(v) => setFormData({ ...formData, gender: v as 'M' | 'F' | 'O' })}
          >
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="O">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="dob">Date of Birth</Label>
          <Input
            id="dob"
            type="date"
            value={formData.date_of_birth || ''}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value || null })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="national_id">National ID</Label>
        <Input
          id="national_id"
          value={formData.national_id || ''}
          onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          value={formData.phone_number || ''}
          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="referring_facility">Referring Facility</Label>
        <Input
          id="referring_facility"
          value={formData.referring_facility || ''}
          onChange={(e) => setFormData({ ...formData, referring_facility: e.target.value })}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Registering...' : 'Register Patient'}
      </Button>
    </form>
  );
}
