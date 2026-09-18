// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Global contact tracing index for surveillance.
 *
 * Use this page to review traced contacts across all cases, filter by risk/workflow,
 * and drill down to case-level contact tracing workspaces.
 *
 * Inputs/args:
 * - Query-backed filters: search, status, risk_level.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type { ContactTracingContact } from '@/lib/types/surveillance';

const RISK_VARIANT: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'secondary',
};

export default function ContactTracingIndexPage() {
  const router = useRouter();
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [riskLevel, setRiskLevel] = useState('all');

  const queryParams = useMemo(() => {
    return {
      page,
      page_size: pageSize,
      search: search.trim() || undefined,
      status: status !== 'all' ? status : undefined,
      risk_level: riskLevel !== 'all' ? riskLevel : undefined,
      ordering: '-created_at',
    };
  }, [page, pageSize, riskLevel, search, status]);

  const { data, isLoading } = useQuery({
    queryKey: ['surveillance-contact-tracing-index', queryParams],
    queryFn: () => surveillanceApi.listContacts(queryParams),
  });

  const contacts = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;
  const hasNext = Boolean(data?.next);
  const hasPrev = page > 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Contact Tracing"
        helpContent="Track and triage traced contacts across all notifiable cases."
      />

      <Card className="space-y-3 p-4">
        <Input
          placeholder="Search by contact name, relationship, or case MRN..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="IDENTIFIED">Identified</SelectItem>
              <SelectItem value="CONTACTED">Contacted</SelectItem>
              <SelectItem value="UNDER_MONITORING">Under Monitoring</SelectItem>
              <SelectItem value="SYMPTOMATIC">Symptomatic</SelectItem>
              <SelectItem value="CLEARED">Cleared</SelectItem>
              <SelectItem value="LOST_TO_FOLLOWUP">Lost to Follow-up</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={riskLevel}
            onValueChange={(value) => {
              setRiskLevel(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <ResponsiveTable
        data={contacts}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        onRowClick={(item) => router.push(`/surveillance/contact-tracing/${item.id}`)}
        columns={[
          {
            key: 'full_name',
            header: 'Contact',
            sortable: true,
            cell: (item: ContactTracingContact) => (
              <div>
                <p className="font-medium">{item.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.relationship_to_case || 'Relationship not specified'}
                </p>
              </div>
            ),
          },
          {
            key: 'case',
            header: 'Case',
            sortable: true,
            cell: (item: ContactTracingContact) => (
              <Link
                href={`/surveillance/cases/${item.case}`}
                className="text-sm text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {item.case_disease_name} (#{item.case})
              </Link>
            ),
          },
          {
            key: 'risk_level',
            header: 'Risk',
            sortable: true,
            cell: (item: ContactTracingContact) => (
              <Badge variant={RISK_VARIANT[item.risk_level] || 'secondary'}>{item.risk_level}</Badge>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            sortable: true,
            cell: (item: ContactTracingContact) => <Badge variant="info">{item.status}</Badge>,
          },
          {
            key: 'next_followup_date',
            header: 'Next Follow-up',
            hideOnMobile: true,
            sortable: true,
            sortType: 'date',
            cell: (item: ContactTracingContact) =>
              item.next_followup_date ? formatDate(item.next_followup_date) : 'Not scheduled',
          },
          {
            key: 'last_followup_at',
            header: 'Last Follow-up',
            hideOnMobile: true,
            sortable: true,
            sortType: 'date',
            cell: (item: ContactTracingContact) =>
              item.last_followup_at ? formatDateTime(item.last_followup_at) : 'Never',
          },
        ]}
      />

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing page {totalPages === 0 ? 0 : page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasPrev}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasNext}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
