// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Facility-scoped Custom Email SMTP settings; rendered only for enabled facilities. */
'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail, PlugZap, Save } from 'lucide-react';
import { toast } from 'sonner';
import { facilityEmailApi } from '@/lib/api/facility-email';
import { useFacility } from '@/lib/context/facility-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SettingLabelProps {
  children: ReactNode;
  help: string;
  htmlFor: string;
}

function SettingLabel({ children, help, htmlFor }: SettingLabelProps) {
  const text = typeof children === 'string' ? children : 'this setting';

  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      <HelpPopover content={help} ariaLabel={`Help: ${text}`} />
    </div>
  );
}

export function FacilityEmailSettings() {
  const { facilityDetail } = useFacility();
  const [providerId, setProviderId] = useState('gmail');
  const [configId, setConfigId] = useState<number | null>(null);
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);
  const [hasCompletedConnectionTest, setHasCompletedConnectionTest] = useState(false);
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    security_mode: 'STARTTLS',
    smtp_username: '',
    smtp_password: '',
    from_address: '',
    from_display_name: '',
    reply_to_address: '',
  });
  const presets = useQuery({
    queryKey: ['facility-email-providers'],
    queryFn: facilityEmailApi.providers,
    enabled: Boolean(facilityDetail?.modules.custom_email),
  });
  const currentConfig = useQuery({
    queryKey: ['facility-email-config', facilityDetail?.id],
    queryFn: facilityEmailApi.current,
    enabled: Boolean(facilityDetail?.modules.custom_email),
  });
  const testConnection = useMutation({
    mutationFn: facilityEmailApi.testConnection,
    onSuccess: () => {
      setSmtpTested(true);
      setHasCompletedConnectionTest(true);
      toast.success('SMTP connection verified. You can now activate facility SMTP.');
    },
    onError: () => {
      setSmtpTested(false);
      setHasCompletedConnectionTest(true);
      toast.error('SMTP connection failed. Check the account, app password, and TLS settings.');
    },
  });
  const save = useMutation({
    mutationFn: facilityEmailApi.save,
    onSuccess: (config) => {
      setConfigId(config.id);
      setSmtpEnabled(config.custom_email_enabled);
      setSmtpTested(false);
      setHasCompletedConnectionTest(false);
      toast.success('SMTP settings saved. Testing the connection now.');
      testConnection.mutate(config.id);
    },
    onError: () => toast.error('Unable to save SMTP settings.'),
  });
  const updateSmtpEnabled = useMutation({
    mutationFn: (custom_email_enabled: boolean) => facilityEmailApi.save({ custom_email_enabled }),
    onSuccess: (config) => {
      setConfigId(config.id);
      setSmtpEnabled(config.custom_email_enabled);
      toast.success(
        config.custom_email_enabled
          ? 'Facility SMTP activated.'
          : 'Facility SMTP deactivated. Messages will use Vitora’s default sender.'
      );
    },
    onError: () => toast.error('Unable to update facility SMTP.'),
  });

  useEffect(() => {
    const config = currentConfig.data;
    if (!config) return;
    setConfigId(config.id);
    setSmtpEnabled(config.custom_email_enabled);
    setSmtpTested(config.status === 'HEALTHY');
    setHasCompletedConnectionTest(true);
    setForm((current) => ({
      ...current,
      smtp_host: config.smtp_host,
      smtp_port: String(config.smtp_port),
      security_mode: config.security_mode,
      smtp_username: config.smtp_username,
      from_address: config.from_address,
      from_display_name: config.from_display_name,
      reply_to_address: config.reply_to_address,
    }));
  }, [currentConfig.data]);

  const isConfigurationSaved = configId !== null;
  const isSmtpActivationPanelVisible = isConfigurationSaved && hasCompletedConnectionTest;

  if (!facilityDetail?.modules.custom_email) return null;
  const selectProvider = (id: string) => {
    const preset = presets.data?.providers.find((item) => item.id === id);
    setProviderId(id);
    setHasCompletedConnectionTest(false);
    if (preset)
      setForm((current) => ({
        ...current,
        smtp_host: preset.smtp_host,
        smtp_port: String(preset.smtp_port),
        security_mode: preset.security_mode,
      }));
  };
  const update = (key: keyof typeof form, value: string) => {
    setHasCompletedConnectionTest(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const testSavedConnection = () => {
    if (configId === null) return;
    setHasCompletedConnectionTest(false);
    testConnection.mutate(configId);
  };

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" />
          Custom Email
        </CardTitle>
        <CardDescription>
          Send facility notifications through your own SMTP account. Use an app password, not a
          staff password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SettingLabel
              htmlFor="email-provider"
              help="Choose a preset to fill in the SMTP host, port, and security settings for your email provider."
            >
              Email provider
            </SettingLabel>
            <Select value={providerId} onValueChange={selectProvider}>
              <SelectTrigger id="email-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.data?.providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="smtp-host"
              help="The outgoing-mail server supplied by your email provider, such as smtp.example.com."
            >
              SMTP host
            </SettingLabel>
            <Input
              id="smtp-host"
              value={form.smtp_host}
              onChange={(event) => update('smtp_host', event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <SettingLabel
            htmlFor="smtp-username"
            help="The username for the SMTP account, usually its email address. If the sender or reply-to address is blank, Vitora uses this address."
          >
            SMTP username
          </SettingLabel>
          <Input
            id="smtp-username"
            value={form.smtp_username}
            onChange={(event) => update('smtp_username', event.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SettingLabel
              htmlFor="from-address"
              help="Recipients see this address as the sender of the message. Use an address that your SMTP account is authorised to send from; if left blank, Vitora uses the SMTP username."
            >
              From address
            </SettingLabel>
            <Input
              id="from-address"
              type="email"
              value={form.from_address}
              onChange={(event) => update('from_address', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="from-display-name"
              help="The friendly name shown with the sender address, such as Demo Health Facility. It does not change the sender email address."
            >
              From display name
            </SettingLabel>
            <Input
              id="from-display-name"
              value={form.from_display_name}
              onChange={(event) => update('from_display_name', event.target.value)}
              placeholder="Facility name"
            />
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="reply-to-address"
              help="Replies are delivered to this mailbox when a recipient uses Reply. It can be different from the sender address; if left blank, Vitora uses the SMTP username."
            >
              Reply-to address
            </SettingLabel>
            <Input
              id="reply-to-address"
              type="email"
              value={form.reply_to_address}
              onChange={(event) => update('reply_to_address', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="smtp-app-password"
              help="Use an app-specific password generated by your email provider. Never enter a staff member's normal account password."
            >
              App password
            </SettingLabel>
            <Input
              id="smtp-app-password"
              type="password"
              value={form.smtp_password}
              placeholder={currentConfig.data?.password_configured ? '••••••••' : ''}
              onChange={(event) => update('smtp_password', event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isConfigurationSaved ? (
            <Button
              onClick={() =>
                save.mutate({
                  ...form,
                  smtp_port: Number(form.smtp_port),
                  custom_email_enabled: smtpEnabled,
                })
              }
              disabled={save.isPending || testConnection.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Save SMTP settings
            </Button>
          ) : (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      onClick={() =>
                        save.mutate({
                          ...form,
                          smtp_port: Number(form.smtp_port),
                          custom_email_enabled: smtpEnabled,
                        })
                      }
                      disabled={save.isPending || testConnection.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save SMTP settings
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Save SMTP settings first to test the connection and enable facility SMTP.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {testConnection.isPending && (
            <Button variant="outline" disabled>
              <PlugZap className="mr-2 h-4 w-4" />
              Testing connection…
            </Button>
          )}
          {isSmtpActivationPanelVisible && (
            <Button variant="outline" onClick={testSavedConnection}>
              <PlugZap className="mr-2 h-4 w-4" />
              Test connection
            </Button>
          )}
        </div>
        {isSmtpActivationPanelVisible && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <SettingLabel
                htmlFor="use-facility-smtp"
                help="Enable this only after a successful connection test. When off, messages use Vitora's default sender instead."
              >
                Use facility SMTP
              </SettingLabel>
              <p className="text-sm text-muted-foreground">
                When off, messages use Vitora&apos;s default sender.
              </p>
            </div>
            <Switch
              id="use-facility-smtp"
              checked={smtpEnabled}
              onCheckedChange={updateSmtpEnabled.mutate}
              disabled={!smtpTested || updateSmtpEnabled.isPending}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
