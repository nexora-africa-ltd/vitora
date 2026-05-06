'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Package,
  Beaker,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { qcMaterialsApi, qcLotsApi, qcRulesApi, qcViolationsApi } from '@/lib/api/qc';
import type { QCMaterial, QCLot, QCRuleViolation } from '@/lib/types/qc';

export default function QCDashboardPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [materialForm, setMaterialForm] = useState({ name: '', manufacturer: '', catalog_number: '', storage_conditions: '' });

  const { data: materialsData } = useQuery({
    queryKey: ['qc-materials'],
    queryFn: () => qcMaterialsApi.list(),
  });

  const { data: lotsData } = useQuery({
    queryKey: ['qc-lots-expiring'],
    queryFn: () => qcLotsApi.expiringSoon(),
  });

  const { data: violations } = useQuery({
    queryKey: ['qc-violations-unacked'],
    queryFn: () => qcViolationsApi.list({ acknowledged: false }),
  });

  const { data: rules } = useQuery({
    queryKey: ['qc-rules'],
    queryFn: () => qcRulesApi.list(),
  });

  const createMaterial = useMutation({
    mutationFn: qcMaterialsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-materials'] });
      setShowMaterialDialog(false);
      setMaterialForm({ name: '', manufacturer: '', catalog_number: '', storage_conditions: '' });
    },
  });

  const seedRules = useMutation({
    mutationFn: qcRulesApi.seedDefaults,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qc-rules'] }),
  });

  const materials = materialsData?.results || [];
  const expiringLots = lotsData || [];
  const unackedViolations = violations || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quality Control"
          helpContent="Manage QC materials, lots, and Westgard rules. Monitor QC results and violations for ISO 15189 compliance."
          actions={
            <Button onClick={() => setShowMaterialDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Material
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Materials</span>
              </div>
              <p className="text-2xl font-bold mt-1">{materials.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Expiring Lots</span>
              </div>
              <p className="text-2xl font-bold mt-1">{expiringLots.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Violations</span>
              </div>
              <p className="text-2xl font-bold mt-1">{unackedViolations.length}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Active Rules</span>
              </div>
              <p className="text-2xl font-bold mt-1">{rules?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="materials" className="w-full">
          <TabsList>
            <TabsTrigger value="materials" className="gap-1">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="lots" className="gap-1">
              <Beaker className="h-4 w-4" />
              <span className="hidden sm:inline">Lots</span>
            </TabsTrigger>
            <TabsTrigger value="violations" className="gap-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Violations</span>
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1">
              <FlaskConical className="h-4 w-4" />
              <span className="hidden sm:inline">Rules</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materials" className="mt-4">
            <ResponsiveTable
              data={materials}
              keyExtractor={(item: QCMaterial) => item.id}
              columns={[
                { key: 'name', header: 'Name', sortable: true, cell: (item: QCMaterial) => item.name },
                { key: 'manufacturer', header: 'Manufacturer', sortable: true, cell: (item: QCMaterial) => item.manufacturer },
                { key: 'catalog_number', header: 'Catalog #', cell: (item: QCMaterial) => item.catalog_number || '—' },
                { key: 'lot_count', header: 'Lots', sortable: true, sortType: 'number' as const, cell: (item: QCMaterial) => item.lot_count },
                {
                  key: 'is_active', header: 'Status', cell: (item: QCMaterial) => (
                    <Badge variant={item.is_active ? 'default' : 'secondary'}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="lots" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lots Expiring Within 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                {expiringLots.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No lots expiring soon.</p>
                ) : (
                  <ResponsiveTable
                    data={expiringLots}
                    keyExtractor={(item: QCLot) => item.id}
                    columns={[
                      { key: 'material_name', header: 'Material', sortable: true, cell: (item: QCLot) => item.material_name },
                      { key: 'lot_number', header: 'Lot #', cell: (item: QCLot) => item.lot_number },
                      { key: 'expiry_date', header: 'Expires', sortable: true, sortType: 'date' as const, cell: (item: QCLot) => item.expiry_date },
                      {
                        key: 'days_until_expiry', header: 'Days Left', sortable: true, sortType: 'number' as const,
                        cell: (item: QCLot) => (
                          <Badge variant={item.days_until_expiry <= 7 ? 'destructive' : 'outline'}>
                            {item.days_until_expiry}d
                          </Badge>
                        ),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="violations" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unacknowledged Violations</CardTitle>
              </CardHeader>
              <CardContent>
                {unackedViolations.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No pending violations. All QC is within limits.</p>
                ) : (
                  <ResponsiveTable
                    data={unackedViolations}
                    keyExtractor={(item: QCRuleViolation) => item.id}
                    columns={[
                      { key: 'rule_name', header: 'Rule', cell: (item: QCRuleViolation) => item.rule_name },
                      {
                        key: 'severity', header: 'Severity',
                        cell: (item: QCRuleViolation) => (
                          <Badge variant={item.severity === 'REJECT' ? 'destructive' : 'outline'}>
                            {item.severity}
                          </Badge>
                        ),
                      },
                      { key: 'description', header: 'Details', cell: (item: QCRuleViolation) => (
                        <span className="text-sm truncate max-w-[200px] block">{item.description}</span>
                      )},
                      { key: 'created_at', header: 'When', sortable: true, sortType: 'date' as const, cell: (item: QCRuleViolation) => new Date(item.created_at).toLocaleDateString() },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Westgard Rules</CardTitle>
                {(!rules || rules.length === 0) && (
                  <Button size="sm" variant="outline" onClick={() => seedRules.mutate()}>
                    Seed Defaults
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!rules || rules.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No rules configured. Click &quot;Seed Defaults&quot; to add standard Westgard rules.</p>
                ) : (
                  <ResponsiveTable
                    data={rules}
                    keyExtractor={(item) => item.id}
                    columns={[
                      { key: 'name', header: 'Rule', cell: (item) => item.name },
                      { key: 'rule_type', header: 'Type', cell: (item) => item.rule_type },
                      {
                        key: 'severity', header: 'Severity',
                        cell: (item) => (
                          <Badge variant={item.severity === 'REJECT' ? 'destructive' : 'outline'}>
                            {item.severity}
                          </Badge>
                        ),
                      },
                      {
                        key: 'is_active', header: 'Active',
                        cell: (item) => (
                          <Badge variant={item.is_active ? 'default' : 'secondary'}>
                            {item.is_active ? 'Yes' : 'No'}
                          </Badge>
                        ),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Material Dialog */}
        <Dialog open={showMaterialDialog} onOpenChange={setShowMaterialDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add QC Material</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                  placeholder="e.g., Liquichek Unassayed Chemistry"
                />
              </div>
              <div>
                <Label>Manufacturer *</Label>
                <Input
                  value={materialForm.manufacturer}
                  onChange={(e) => setMaterialForm({ ...materialForm, manufacturer: e.target.value })}
                  placeholder="e.g., Bio-Rad"
                />
              </div>
              <div>
                <Label>Catalog Number</Label>
                <Input
                  value={materialForm.catalog_number}
                  onChange={(e) => setMaterialForm({ ...materialForm, catalog_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Storage Conditions</Label>
                <Input
                  value={materialForm.storage_conditions}
                  onChange={(e) => setMaterialForm({ ...materialForm, storage_conditions: e.target.value })}
                  placeholder="e.g., 2-8°C"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMaterialDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMaterial.mutate(materialForm)}
                disabled={!materialForm.name || !materialForm.manufacturer || createMaterial.isPending}
              >
                {createMaterial.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
