/**
 * Imaging Equipment List Page
 * Phase E: Equipment registry with auto-registered and manual entries.
 */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModalityBadge } from '@/components/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { ImagingEquipment, ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';
import { formatDate } from '@/lib/utils/format';
import { Search, Cpu, AlertTriangle, Bot, Plus } from 'lucide-react';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function ImagingEquipmentPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const canManageEquipment = canPerformAction('imaging.manage_equipment');
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['imaging-equipment', search, modality, page],
    queryFn: () =>
      imagingApi.listEquipment({
        search: search || undefined,
        modality: modality !== 'all' ? modality : undefined,
        page,
        page_size: 25,
      }),
    staleTime: 30000,
  });

  const equipment = data?.results || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Equipment Registry"
          helpContent="Imaging equipment is auto-registered from DICOM headers when studies are uploaded or received via C-STORE. You can also manually add equipment for QA tracking and calibration management."
          actions={
            canManageEquipment ? (
              <Button size="sm" onClick={() => router.push('/imaging/equipment/new')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Equipment
              </Button>
            ) : undefined
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, AE title, serial..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select value={modality} onValueChange={(v) => { setModality(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Modality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modalities</SelectItem>
              {Object.entries(MODALITY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={equipment}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          onRowClick={(item) => router.push(`/imaging/equipment/${item.id}`)}
          emptyMessage="No equipment found"
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (item) => (
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    {item.ae_title && (
                      <p className="text-xs text-muted-foreground">AET: {item.ae_title}</p>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'modality',
              header: 'Modality',
              sortable: true,
              cell: (item) => (
                <ModalityBadge modality={item.modality as ImagingModality} />
              ),
            },
            {
              key: 'manufacturer',
              header: 'Manufacturer',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => (
                <span className="text-sm">
                  {[item.manufacturer, item.model_name].filter(Boolean).join(' ') || '—'}
                </span>
              ),
            },
            {
              key: 'room',
              header: 'Room',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => item.room || '—',
            },
            {
              key: 'calibration',
              header: 'Calibration',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => {
                if (item.is_calibration_overdue) {
                  return (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Overdue
                    </Badge>
                  );
                }
                if (item.next_calibration_due) {
                  return (
                    <span className="text-xs text-muted-foreground">
                      Due {formatDate(item.next_calibration_due)}
                    </span>
                  );
                }
                return <span className="text-xs text-muted-foreground">—</span>;
              },
            },
            {
              key: 'status',
              header: 'Status',
              cell: (item) => (
                <div className="flex items-center gap-1.5">
                  {item.auto_registered && (
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-label="Auto-registered" />
                  )}
                  <Badge variant={item.is_active ? 'default' : 'secondary'}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ),
            },
            {
              key: 'studies_count',
              header: 'Studies',
              sortable: true,
              sortType: 'number' as const,
              hideOnMobile: true,
              cell: (item) => item.studies_count,
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.manufacturer, item.model_name].filter(Boolean).join(' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.auto_registered && <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
                  <ModalityBadge modality={item.modality as ImagingModality} />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {item.room && <span>Room: {item.room}</span>}
                <span>{item.studies_count} studies</span>
                {item.is_calibration_overdue && (
                  <Badge variant="destructive" className="gap-1 text-[10px] h-4">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Overdue
                  </Badge>
                )}
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {data && data.count > 25 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm self-center text-muted-foreground">
              Page {page} of {Math.ceil(data.count / 25)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
