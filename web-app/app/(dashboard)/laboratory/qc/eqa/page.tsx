'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { eqaSurveysApi } from '@/lib/api/qc';
import type { EQASurvey } from '@/lib/types/qc';

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  SUBMITTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  RESULTS_RECEIVED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function EQAPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState({
    provider: '', survey_id: '', name: '', category: '', due_date: '',
  });

  const { data: surveysData } = useQuery({
    queryKey: ['eqa-surveys'],
    queryFn: () => eqaSurveysApi.list(),
  });

  const createSurvey = useMutation({
    mutationFn: eqaSurveysApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eqa-surveys'] });
      setShowCreateDialog(false);
      setForm({ provider: '', survey_id: '', name: '', category: '', due_date: '' });
    },
  });

  const markSubmitted = useMutation({
    mutationFn: (id: number) => eqaSurveysApi.markSubmitted(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eqa-surveys'] }),
  });

  const surveys: EQASurvey[] = surveysData?.results || [];
  const overdue = surveys.filter((s: EQASurvey) => s.is_overdue);
  const pending = surveys.filter((s: EQASurvey) => s.status === 'PENDING' || s.status === 'IN_PROGRESS');

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Proficiency Testing (EQA)"
          helpContent="Track external quality assessment surveys from HUQAS, NEQAS, CAP. Record submissions and monitor z-scores."
          actions={
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Survey
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Surveys</span>
              </div>
              <p className="text-2xl font-bold mt-1">{surveys.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold mt-1">{pending.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Overdue</span>
              </div>
              <p className="text-2xl font-bold mt-1">{overdue.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Submitted</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {surveys.filter((s: EQASurvey) => s.status === 'SUBMITTED' || s.status === 'RESULTS_RECEIVED' || s.status === 'CLOSED').length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Surveys Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">EQA Surveys</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={surveys}
              keyExtractor={(item: EQASurvey) => item.id}
              defaultSortColumn="due_date"
              defaultSortDirection="desc"
              columns={[
                { key: 'provider', header: 'Provider', sortable: true, cell: (item: EQASurvey) => item.provider },
                { key: 'name', header: 'Name', sortable: true, cell: (item: EQASurvey) => item.name },
                { key: 'category', header: 'Category', cell: (item: EQASurvey) => item.category || '—', hideOnMobile: true },
                { key: 'due_date', header: 'Due Date', sortable: true, sortType: 'date' as const, cell: (item: EQASurvey) => (
                  <span className={item.is_overdue ? 'text-destructive font-medium' : ''}>
                    {item.due_date}
                  </span>
                )},
                { key: 'status', header: 'Status', cell: (item: EQASurvey) => (
                  <Badge className={statusColors[item.status] || ''}>
                    {item.status.replace('_', ' ')}
                  </Badge>
                )},
                { key: 'acceptable_rate', header: 'Score', hideOnMobile: true, cell: (item: EQASurvey) => (
                  item.acceptable_rate !== null ? `${item.acceptable_rate}%` : '—'
                )},
                { key: 'actions', header: '', cell: (item: EQASurvey) => (
                  item.status === 'PENDING' || item.status === 'IN_PROGRESS' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); markSubmitted.mutate(item.id); }}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Submit
                    </Button>
                  ) : null
                )},
              ]}
            />
          </CardContent>
        </Card>

        {/* Create Survey Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register EQA Survey</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provider *</Label>
                <Input
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g., HUQAS, NEQAS, CAP"
                />
              </div>
              <div>
                <Label>Survey ID *</Label>
                <Input
                  value={form.survey_id}
                  onChange={(e) => setForm({ ...form, survey_id: e.target.value })}
                  placeholder="e.g., HQ-2026-Q1-CHEM"
                />
              </div>
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Chemistry Q1 2026"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g., Chemistry, Hematology"
                />
              </div>
              <div>
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createSurvey.mutate(form)}
                disabled={!form.provider || !form.survey_id || !form.name || !form.due_date || createSurvey.isPending}
              >
                {createSurvey.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
