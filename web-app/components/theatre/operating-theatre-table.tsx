'use client';

import { Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  formatTheatreHours,
  TheatreOperationalStatusBadge,
  TheatreSchedulingReadinessBadge,
  THEATRE_TYPE_LABELS,
} from '@/components/theatre/theatre-display';
import type { OperatingTheatreList } from '@/lib/types/theatre';

interface OperatingTheatreTableProps {
  theatres: OperatingTheatreList[];
  isLoading: boolean;
  isToggling: boolean;
  onEdit: (theatre: OperatingTheatreList) => void;
  onToggle: (theatre: OperatingTheatreList) => void;
}

export function OperatingTheatreTable({
  theatres,
  isLoading,
  isToggling,
  onEdit,
  onToggle,
}: OperatingTheatreTableProps) {
  return (
    <ResponsiveTable
      data={theatres}
      keyExtractor={(theatre) => theatre.id}
      isLoading={isLoading}
      emptyMessage="No operating theatres configured yet."
      columns={[
        {
          key: 'name',
          header: 'Theatre',
          sortable: true,
          cell: (theatre) => (
            <div>
              <div className="font-medium">{theatre.name}</div>
              <div className="text-xs text-muted-foreground">{theatre.code}</div>
            </div>
          ),
        },
        {
          key: 'theatre_type',
          header: 'Type',
          sortable: true,
          cell: (theatre) => THEATRE_TYPE_LABELS[theatre.theatre_type],
        },
        {
          key: 'location',
          header: 'Location',
          sortable: true,
          cell: (theatre) => theatre.location || '—',
          hideOnMobile: true,
        },
        {
          key: 'hours',
          header: 'Hours',
          sortable: true,
          sortFn: (a, b) => a.operating_hours_start.localeCompare(b.operating_hours_start),
          cell: (theatre) => formatTheatreHours(theatre.operating_hours_start, theatre.operating_hours_end),
          hideOnMobile: true,
        },
        {
          key: 'slot_duration_minutes',
          header: 'Slots',
          sortable: true,
          sortType: 'number',
          cell: (theatre) => `${theatre.slot_duration_minutes} min`,
          hideOnMobile: true,
        },
        {
          key: 'schedule_status',
          header: 'Scheduling',
          sortable: true,
          sortFn: (a, b) => Number(a.has_resource_schedule) - Number(b.has_resource_schedule),
          cell: (theatre) => <TheatreSchedulingReadinessBadge ready={theatre.has_resource_schedule} />,
        },
        {
          key: 'is_active',
          header: 'Status',
          sortable: true,
          sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
          cell: (theatre) => <TheatreOperationalStatusBadge isActive={theatre.is_active} />,
        },
        {
          key: 'actions',
          header: '',
          cell: (theatre) => (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(theatre)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" disabled={isToggling} onClick={() => onToggle(theatre)}>
                {theatre.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              </Button>
            </div>
          ),
        },
      ]}
      mobileCard={(theatre) => (
        <Card className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{theatre.name}</p>
              <p className="text-sm text-muted-foreground">{theatre.code} • {THEATRE_TYPE_LABELS[theatre.theatre_type]}</p>
              <p className="text-xs text-muted-foreground">{theatre.location || 'No location'} • {formatTheatreHours(theatre.operating_hours_start, theatre.operating_hours_end)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <TheatreSchedulingReadinessBadge ready={theatre.has_resource_schedule} />
              <TheatreOperationalStatusBadge isActive={theatre.is_active} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Slots: {theatre.slot_duration_minutes} min</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onEdit(theatre)}>Edit</Button>
              <Button type="button" size="sm" variant="outline" disabled={isToggling} onClick={() => onToggle(theatre)}>
                {theatre.is_active ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    />
  );
}
