'use client';

import React, { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useValidateVisitAuthorization, useVisitAuthorizations } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { InsuranceVisitAuthorization } from '@/lib/types/insurance';

export default function InsuranceAuthorizationsPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useVisitAuthorizations({ page: 1 });
  const validate = useValidateVisitAuthorization();
  const [authToken, setAuthToken] = useState('');

  const handleValidate = async (row: InsuranceVisitAuthorization) => {
    try {
      await validate.mutateAsync({
        id: row.id,
        data: {
          first_name: row.patient_name.split(' ')[0] || row.patient_name,
          last_name: row.patient_name.split(' ').slice(1).join(' ') || row.patient_name,
          member_number: row.member_number,
          auth_token: authToken || row.auth_token,
          scheme_name: '',
        },
      });
      toast({ title: 'Authorization validated' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to validate authorization.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Visit Authorizations" helpContent="Review and validate HealthCloud visit authorizations." />
      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Label className="whitespace-nowrap">Token override</Label>
          <Input value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="Optional auth token to use on validate" />
        </CardContent>
      </Card>
      <ResponsiveTable<InsuranceVisitAuthorization>
        data={data?.results ?? []}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyMessage="No authorizations found."
        columns={[
          { key: 'patient_name', header: 'Patient', cell: (item) => item.patient_name },
          { key: 'member_number', header: 'Member #', cell: (item) => item.member_number },
          { key: 'authorization_guid', header: 'Authorization GUID', cell: (item) => item.authorization_guid || '-' },
          { key: 'status', header: 'Status', cell: (item) => item.status.replace('_', ' ') },
          {
            key: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button size="sm" variant="outline" onClick={() => void handleValidate(item)}>
                Validate Token
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
