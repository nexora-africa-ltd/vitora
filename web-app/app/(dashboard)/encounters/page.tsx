'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Filter, Calendar, Users, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EncounterTable } from '@/components/encounters/encounter-table';
import { ConsultationQueueContainer } from '@/components/encounters/consultation-queue-container';
import { useEncounters } from '@/lib/hooks/use-encounters';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS } from '@/lib/utils/constants';

export default function EncountersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('queue');
  const [status, setStatus] = useState<string>('');
  const [encounterType, setEncounterType] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error } = useEncounters({
    page,
    page_size: pageSize,
    status: status || undefined,
    encounter_type: encounterType || undefined,
    ordering: '-encounter_date',
  });

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Encounters"
        description="Manage patient consultations and clinical encounters"
        actions={
          <Button onClick={() => router.push('/encounters/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Encounter
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
          <TabsTrigger value="queue" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="sm:hidden">Queue</span>
            <span className="hidden sm:inline">Consultation Queue</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="sm:hidden">All</span>
            <span className="hidden sm:inline">All Encounters</span>
          </TabsTrigger>
        </TabsList>

        {/* Consultation Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <ConsultationQueueContainer />
        </TabsContent>

        {/* All Encounters Tab */}
        <TabsContent value="all" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ENCOUNTER_STATUS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={encounterType}
              onValueChange={(value) => {
                setEncounterType(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENCOUNTER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Encounters table */}
          <EncounterTable
            encounters={data?.results ?? []}
            isLoading={isLoading}
            error={error as Error | null}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
