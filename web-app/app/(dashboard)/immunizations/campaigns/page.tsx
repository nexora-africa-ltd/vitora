'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  CalendarCheck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { vaccineCampaignsApi, vaccineDefinitionsApi } from '@/lib/api/immunizations';
import type {
  CampaignStatus,
  TargetPopulation,
  VaccineCampaignListItem,
} from '@/lib/types/immunizations';

const campaignStatusColors: Record<CampaignStatus, string> = {
  PLANNED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const STATUS_FILTER: { value: CampaignStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const POPULATION_OPTIONS: { value: TargetPopulation; label: string }[] = [
  { value: 'ALL', label: 'All Ages' },
  { value: 'INFANT', label: 'Infant (0-11 months)' },
  { value: 'CHILD', label: 'Child (1-9 years)' },
  { value: 'ADOLESCENT', label: 'Adolescent (10-17 years)' },
  { value: 'ADULT', label: 'Adult (18+ years)' },
];

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDateVal, setStartDateVal] = useState('');
  const [endDateVal, setEndDateVal] = useState('');
  const [targetPopulation, setTargetPopulation] = useState<TargetPopulation>('ALL');
  const [targetCount, setTargetCount] = useState('');
  const [selectedVaccineIds, setSelectedVaccineIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', statusFilter],
    queryFn: () =>
      vaccineCampaignsApi.list({
        status: statusFilter || undefined,
        ordering: '-start_date',
      }),
  });

  const { data: vaccines } = useQuery({
    queryKey: ['vaccine-defs-campaign'],
    queryFn: () => vaccineDefinitionsApi.list({ program: 'CAMPAIGN' }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      vaccineCampaignsApi.create({
        name,
        description,
        start_date: startDateVal,
        end_date: endDateVal,
        target_population: targetPopulation,
        target_count: targetCount ? parseInt(targetCount, 10) : undefined,
        vaccines: selectedVaccineIds.length > 0 ? selectedVaccineIds : undefined,
        status: 'PLANNED',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign Created', description: 'New vaccination campaign has been created.' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create campaign.', variant: 'destructive' });
    },
  });

  function resetForm() {
    setName('');
    setDescription('');
    setStartDateVal('');
    setEndDateVal('');
    setTargetPopulation('ALL');
    setTargetCount('');
    setSelectedVaccineIds([]);
  }

  const campaigns = data?.results || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Vaccine Campaigns"
          helpContent="Manage mass vaccination campaigns (e.g., COVID-19 boosters, Polio mop-ups). Create campaigns, track progress, and monitor target coverage."
          actions={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Campaign</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filter */}
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v === '_all' ? '' : (v as CampaignStatus))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaigns Table */}
        <ResponsiveTable
          data={campaigns}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No campaigns found."
          columns={[
            {
              key: 'name',
              header: 'Campaign',
              sortable: true,
              cell: (c) => (
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.target_population}</p>
                </div>
              ),
            },
            {
              key: 'start_date',
              header: 'Period',
              sortable: true,
              sortType: 'date',
              cell: (c) => (
                <span className="text-sm">
                  {formatDate(c.start_date)} – {formatDate(c.end_date)}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'target_count',
              header: 'Target',
              sortable: true,
              sortType: 'number',
              cell: (c) => (
                <span className="text-sm">{c.target_count.toLocaleString()}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (c) => (
                <Badge className={`${campaignStatusColors[c.status]} shrink-0 w-fit`}>
                  {c.status}
                </Badge>
              ),
            },
          ]}
          mobileCard={(c: VaccineCampaignListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(c.start_date)} – {formatDate(c.end_date)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Target: {c.target_count.toLocaleString()} • {c.target_population}
                    </span>
                  </div>
                </div>
                <Badge className={`${campaignStatusColors[c.status]} shrink-0 w-fit self-start`}>
                  {c.status}
                </Badge>
              </div>
            </Card>
          )}
        />

        {/* Create Campaign Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>New Vaccination Campaign</DialogTitle>
                <HelpPopover content="Create a new mass vaccination campaign. Set the target population, date range, and associated vaccines." />
              </div>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Campaign Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. COVID-19 Booster Campaign 2026"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Campaign details..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={startDateVal} onChange={(e) => setStartDateVal(e.target.value)} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={endDateVal} onChange={(e) => setEndDateVal(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Target Population</Label>
                  <Select value={targetPopulation} onValueChange={(v) => setTargetPopulation(v as TargetPopulation)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target Count</Label>
                  <Input
                    type="number"
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>
              {vaccines && vaccines.length > 0 && (
                <div>
                  <Label>Vaccines</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {vaccines.map((v) => {
                      const selected = selectedVaccineIds.includes(v.id);
                      return (
                        <Badge
                          key={v.id}
                          variant={selected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedVaccineIds((prev) =>
                              selected ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                            );
                          }}
                        >
                          {v.name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!name || !startDateVal || !endDateVal || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Create Campaign
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
