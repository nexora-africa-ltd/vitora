// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Facility-scoped Custom Email SMTP settings; rendered only for enabled facilities. */
'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail, PlugZap, Save } from 'lucide-react';
import { toast } from 'sonner';
import { facilityEmailApi } from '@/lib/api/facility-email';
import { useFacility } from '@/lib/context/facility-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function FacilityEmailSettings() {
  const { facilityDetail } = useFacility();
  const [providerId, setProviderId] = useState('gmail');
  const [configId, setConfigId] = useState<number | null>(null);
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);
  const [form, setForm] = useState({ smtp_host: '', smtp_port: '587', security_mode: 'STARTTLS', smtp_username: '', smtp_password: '', from_address: '', from_display_name: '', reply_to_address: '' });
  const presets = useQuery({ queryKey: ['facility-email-providers'], queryFn: facilityEmailApi.providers, enabled: Boolean(facilityDetail?.modules.custom_email) });
  const currentConfig = useQuery({ queryKey: ['facility-email-config', facilityDetail?.id], queryFn: facilityEmailApi.current, enabled: Boolean(facilityDetail?.modules.custom_email) });
  const save = useMutation({ mutationFn: facilityEmailApi.save, onSuccess: (config) => { setConfigId(config.id); toast.success('SMTP settings saved. Test the connection before enabling Custom Email.'); }, onError: () => toast.error('Unable to save SMTP settings.') });
  const testConnection = useMutation({ mutationFn: facilityEmailApi.testConnection, onSuccess: () => { setSmtpTested(true); toast.success('SMTP connection verified. You can now activate facility SMTP.'); }, onError: () => toast.error('SMTP connection failed. Check the account, app password, and TLS settings.') });

  useEffect(() => {
    const config = currentConfig.data;
    if (!config) return;
    setConfigId(config.id); setSmtpEnabled(config.custom_email_enabled); setSmtpTested(config.status === 'HEALTHY');
    setForm((current) => ({ ...current, smtp_host: config.smtp_host, smtp_port: String(config.smtp_port), security_mode: config.security_mode, smtp_username: config.smtp_username, from_address: config.from_address, from_display_name: config.from_display_name, reply_to_address: config.reply_to_address }));
  }, [currentConfig.data]);

  if (!facilityDetail?.modules.custom_email) return null;
  const selectProvider = (id: string) => { const preset = presets.data?.providers.find((item) => item.id === id); setProviderId(id); if (preset) setForm((current) => ({ ...current, smtp_host: preset.smtp_host, smtp_port: String(preset.smtp_port), security_mode: preset.security_mode })); };
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return <Card className="relative overflow-hidden">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />Custom Email</CardTitle><CardDescription>Send facility notifications through your own SMTP account. Use an app password, not a staff password.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Email provider</Label><Select value={providerId} onValueChange={selectProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{presets.data?.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>SMTP host</Label><Input value={form.smtp_host} onChange={(event) => update('smtp_host', event.target.value)} /></div></div>
      <div className="space-y-2"><Label>SMTP username</Label><Input value={form.smtp_username} onChange={(event) => update('smtp_username', event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>From address</Label><Input type="email" value={form.from_address} onChange={(event) => update('from_address', event.target.value)} /></div><div className="space-y-2"><Label>From display name</Label><Input value={form.from_display_name} onChange={(event) => update('from_display_name', event.target.value)} placeholder="Facility name" /></div><div className="space-y-2"><Label>Reply-to address</Label><Input type="email" value={form.reply_to_address} onChange={(event) => update('reply_to_address', event.target.value)} /></div><div className="space-y-2"><Label>App password</Label><Input type="password" value={form.smtp_password} placeholder={currentConfig.data?.password_configured ? '••••••••' : ''} onChange={(event) => update('smtp_password', event.target.value)} /></div></div>
      <div className="flex items-center justify-between rounded-lg border p-3"><div><Label>Use facility SMTP</Label><p className="text-sm text-muted-foreground">When off, messages use Vitora&apos;s default sender.</p></div><Switch checked={smtpEnabled} onCheckedChange={(checked) => { setSmtpEnabled(checked); save.mutate({ ...form, smtp_port: Number(form.smtp_port), custom_email_enabled: checked }); }} disabled={!smtpTested || save.isPending} /></div>
      <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={() => save.mutate({ ...form, smtp_port: Number(form.smtp_port), custom_email_enabled: smtpEnabled })} disabled={save.isPending}><Save className="mr-2 h-4 w-4" />Save SMTP settings</Button><Button variant="outline" onClick={() => configId && testConnection.mutate(configId)} disabled={!configId || testConnection.isPending}><PlugZap className="mr-2 h-4 w-4" />Test connection</Button></div>
    </CardContent>
  </Card>;
}
