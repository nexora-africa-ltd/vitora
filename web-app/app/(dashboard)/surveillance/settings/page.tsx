// # Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Surveillance notification settings page.
 *
 * What this file is for:
 * - Manage facility-scoped county notification channels and retry behavior.
 *
 * How to use it:
 * - Open /surveillance/settings in the dashboard and update channel settings.
 *
 * Supported inputs/args:
 * - Uses authenticated facility context from API; no CLI args.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { surveillanceApi } from '@/lib/api/surveillance';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from 'sonner';

export default function SurveillanceSettingsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('surveillance.manage_thresholds');

  const { data, isLoading, error } = useQuery({
    queryKey: ['surveillance-notification-settings'],
    queryFn: () => surveillanceApi.getNotificationSettings(),
  });

  const [notifyViaSms, setNotifyViaSms] = useState(false);
  const [notifyViaEmail, setNotifyViaEmail] = useState(false);
  const [smsRecipient, setSmsRecipient] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [includePatientIdentifiers, setIncludePatientIdentifiers] = useState(false);
  const [maxRetryAttempts, setMaxRetryAttempts] = useState(3);
  const [retryBackoffMinutes, setRetryBackoffMinutes] = useState(15);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!data) {
      return;
    }
    setNotifyViaSms(data.notify_via_sms);
    setNotifyViaEmail(data.notify_via_email);
    setIncludePatientIdentifiers(data.include_patient_identifiers);
    setMaxRetryAttempts(data.max_retry_attempts);
    setRetryBackoffMinutes(data.retry_backoff_minutes);
    setIsActive(data.is_active);
  }, [data]);

  const settingsId = data?.id;

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!settingsId) {
        throw new Error('Settings unavailable');
      }
      return surveillanceApi.updateNotificationSettings(settingsId, {
        notify_via_sms: notifyViaSms,
        notify_via_email: notifyViaEmail,
        sms_recipient: smsRecipient.trim() || undefined,
        email_recipient: emailRecipient.trim() || undefined,
        include_patient_identifiers: includePatientIdentifiers,
        max_retry_attempts: maxRetryAttempts,
        retry_backoff_minutes: retryBackoffMinutes,
        is_active: isActive,
      });
    },
    onSuccess: () => {
      toast.success('Surveillance settings updated');
      setSmsRecipient('');
      setEmailRecipient('');
      queryClient.invalidateQueries({ queryKey: ['surveillance-notification-settings'] });
    },
    onError: () => {
      toast.error('Failed to update surveillance settings');
    },
  });

  const hintText = useMemo(() => {
    if (notifyViaSms && notifyViaEmail) {
      return 'County notifications will be dispatched to both SMS and email when a case is marked as notified.';
    }
    if (notifyViaSms) {
      return 'County notifications will be dispatched by SMS only.';
    }
    if (notifyViaEmail) {
      return 'County notifications will be dispatched by email only.';
    }
    return 'No outbound county channel is enabled. Notify County will only change status until you enable a channel.';
  }, [notifyViaEmail, notifyViaSms]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 text-center text-destructive">
        Failed to load surveillance settings.
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Surveillance Settings"
        helpContent="Configure facility-specific county notification channels, retry behavior, and PII-safe payload options for disease surveillance."
      />

      {!canEdit && (
        <Alert>
          <AlertDescription>
            You have read-only access. Contact an administrator to update surveillance settings.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">County Notification Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="settings-active">Settings active</Label>
            <div className="flex items-center gap-3">
              <Switch
                id="settings-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={!canEdit}
              />
              <span className="text-sm text-muted-foreground">
                {isActive ? 'Enabled for this facility' : 'Disabled for this facility'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notify-sms">Notify via SMS</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id="notify-sms"
                  checked={notifyViaSms}
                  onCheckedChange={setNotifyViaSms}
                  disabled={!canEdit}
                />
                <span className="text-sm text-muted-foreground">
                  Masked: {data.sms_recipient_masked || 'Not configured'}
                </span>
              </div>
              <Input
                placeholder="e.g. +254700123456"
                value={smsRecipient}
                onChange={(event) => setSmsRecipient(event.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notify-email">Notify via Email</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id="notify-email"
                  checked={notifyViaEmail}
                  onCheckedChange={setNotifyViaEmail}
                  disabled={!canEdit}
                />
                <span className="text-sm text-muted-foreground">
                  Masked: {data.email_recipient_masked || 'Not configured'}
                </span>
              </div>
              <Input
                type="email"
                placeholder="county.alerts@example.org"
                value={emailRecipient}
                onChange={(event) => setEmailRecipient(event.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <Alert>
            <AlertDescription>{hintText}</AlertDescription>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-retries">Max retry attempts</Label>
              <Input
                id="max-retries"
                type="number"
                min={1}
                max={10}
                value={maxRetryAttempts}
                onChange={(event) => setMaxRetryAttempts(Number(event.target.value) || 1)}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retry-backoff">Retry backoff (minutes)</Label>
              <Input
                id="retry-backoff"
                type="number"
                min={1}
                max={1440}
                value={retryBackoffMinutes}
                onChange={(event) => setRetryBackoffMinutes(Number(event.target.value) || 1)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="include-identifiers">Include patient identifiers in outbound message</Label>
            <div className="flex items-center gap-3">
              <Switch
                id="include-identifiers"
                checked={includePatientIdentifiers}
                onCheckedChange={setIncludePatientIdentifiers}
                disabled={!canEdit}
              />
              <span className="text-sm text-muted-foreground">
                Keep disabled to maintain PII-minimized county notifications.
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => updateMutation.mutate()} disabled={!canEdit || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
