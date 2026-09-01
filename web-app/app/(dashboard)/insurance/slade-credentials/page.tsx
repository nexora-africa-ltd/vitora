/**
 * Slade credentials management page.
 * Usage: Open within dashboard at /insurance/slade-credentials to create/update facility OAuth credentials.
 * Inputs: Slade client ID, client secret, username, and password from HealthCloud by Slade360.
 */
'use client';

import React, { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  useCreateFacilitySladeCredential,
  useFacilitySladeCredential,
  useUpdateFacilitySladeCredential,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';

export default function SladeCredentialsPage() {
  const { toast } = useToast();
  const { data: currentCredential, isLoading, refetch } = useFacilitySladeCredential();
  const createCredential = useCreateFacilitySladeCredential();
  const updateCredential = useUpdateFacilitySladeCredential();

  const [form, setForm] = useState({
    slade_client_id: '',
    slade_client_secret: '',
    slade_username: '',
    slade_password: '',
  });

  const isSaving = createCredential.isPending || updateCredential.isPending;

  const handleSave = async () => {
    const payload: Record<string, string> = {};
    if (form.slade_client_id) payload.slade_client_id = form.slade_client_id;
    if (form.slade_client_secret) payload.slade_client_secret = form.slade_client_secret;
    if (form.slade_username) payload.slade_username = form.slade_username;
    if (form.slade_password) payload.slade_password = form.slade_password;

    if (Object.keys(payload).length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'Enter at least one credential field to update.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (currentCredential) {
        await updateCredential.mutateAsync({ id: currentCredential.id, data: payload });
      } else {
        await createCredential.mutateAsync(payload);
      }
      setForm({
        slade_client_id: '',
        slade_client_secret: '',
        slade_username: '',
        slade_password: '',
      });
      await refetch();
      toast({ title: 'Slade credentials saved' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save Slade credentials.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Slade Credentials"
        helpContent="Manage facility-level Slade OAuth credentials used by HealthCloud workflows. Credentials are encrypted at rest and never returned by the API."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credential Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading credential status...</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {currentCredential?.is_configured
                ? `Configured (last updated ${new Date(currentCredential.updated_at).toLocaleString()})`
                : 'Not configured yet'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Slade Client ID</Label>
              <Input
                type="text"
                autoComplete="off"
                placeholder={currentCredential ? '••••••••' : 'Client ID'}
                value={form.slade_client_id}
                onChange={(e) => setForm((prev) => ({ ...prev, slade_client_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Slade Client Secret</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={currentCredential ? '••••••••' : 'Client Secret'}
                value={form.slade_client_secret}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, slade_client_secret: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Slade Username</Label>
              <Input
                type="text"
                autoComplete="off"
                placeholder={currentCredential ? '••••••••' : 'Username'}
                value={form.slade_username}
                onChange={(e) => setForm((prev) => ({ ...prev, slade_username: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Slade Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={currentCredential ? '••••••••' : 'Password'}
                value={form.slade_password}
                onChange={(e) => setForm((prev) => ({ ...prev, slade_password: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Credentials'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
