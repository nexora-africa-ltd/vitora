'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laboratoryApi } from '@/lib/api/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Cpu,
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity,
  Plus,
  Zap,
  PlugZap,
  Settings2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  InstrumentChannel,
  InstrumentChannelCreateData,
  AnalyzerDashboard,
  AnalyzerDriverTemplate,
  Instrument,
  ChannelProtocol,
} from '@/lib/types/laboratory';

const statusColors: Record<string, string> = {
  CONNECTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  DISCONNECTED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  IDLE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const protocolLabels: Record<ChannelProtocol, string> = {
  ASTM: 'ASTM E1394 / LIS2-A2',
  HL7: 'HL7 v2.x (MLLP)',
  SERIAL: 'Serial RS-232 (TCP Bridge)',
  TCP: 'Raw TCP/IP',
};

export default function AnalyzersPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState('channels');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<InstrumentChannel | null>(null);

  // --- Data Queries ---
  const { data: dashboard } = useQuery<AnalyzerDashboard>({
    queryKey: ['analyzer-dashboard'],
    queryFn: () => laboratoryApi.getAnalyzerDashboard(),
  });

  const { data: channels = [], isLoading: channelsLoading } = useQuery<InstrumentChannel[]>({
    queryKey: ['analyzer-channels'],
    queryFn: () => laboratoryApi.listChannels(),
  });

  const { data: templates = [] } = useQuery<AnalyzerDriverTemplate[]>({
    queryKey: ['analyzer-templates'],
    queryFn: () => laboratoryApi.listDriverTemplates(),
  });

  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => laboratoryApi.listInstruments(),
  });

  // --- Mutations ---
  const createChannel = useMutation({
    mutationFn: (data: InstrumentChannelCreateData) => laboratoryApi.createChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzer-channels'] });
      queryClient.invalidateQueries({ queryKey: ['analyzer-dashboard'] });
      toast.success('Channel created successfully');
      setShowAddDialog(false);
    },
    onError: () => toast.error('Failed to create channel'),
  });

  const applyTemplate = useMutation({
    mutationFn: ({ channelId, templateId }: { channelId: number; templateId: number }) =>
      laboratoryApi.applyDriverTemplate(channelId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzer-channels'] });
      toast.success('Driver template applied');
      setShowTemplateDialog(false);
    },
    onError: () => toast.error('Failed to apply template'),
  });

  const testConnection = useMutation({
    mutationFn: (id: number) => laboratoryApi.testChannelConnection(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analyzer-channels'] });
      queryClient.invalidateQueries({ queryKey: ['analyzer-dashboard'] });
      const status = (data as { status?: string })?.status;
      if (status === 'connected') {
        toast.success('Connection successful');
      } else {
        toast.warning(`Connection test: ${status || 'unknown'}`);
      }
    },
    onError: () => toast.error('Connection test failed'),
  });

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Analyzer Interfacing"
          helpContent="Connect laboratory instruments to receive results automatically. Create a channel for each analyzer, select a protocol, and optionally apply a driver template for pre-configured settings."
          actions={
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Channel</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Stats Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Channels</p>
                </div>
                <p className="text-xl font-bold mt-1">{dashboard.active_channels}/{dashboard.total_channels}</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
                <p className="text-xl font-bold mt-1">{dashboard.connected_channels}</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Results Today</p>
                </div>
                <p className="text-xl font-bold mt-1">{dashboard.results_applied_today}</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
                <p className="text-xl font-bold mt-1">{dashboard.error_channels}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="channels" className="gap-1.5">
              <PlugZap className="h-4 w-4" />
              <span className="hidden sm:inline">Channels</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Driver Templates</span>
            </TabsTrigger>
          </TabsList>

          {/* Channels Tab */}
          <TabsContent value="channels" className="mt-4">
            {channels.length === 0 && !channelsLoading ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <PlugZap className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No analyzer channels configured</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-6">
                    Create a channel to connect a laboratory instrument. Each channel defines how Vitora
                    communicates with an analyzer — protocol, host, and port.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={() => setShowAddDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Channel Manually
                    </Button>
                    {templates.length > 0 && (
                      <Button variant="outline" onClick={() => setTab('templates')}>
                        <Settings2 className="h-4 w-4 mr-2" />
                        Browse Driver Templates
                      </Button>
                    )}
                  </div>
                  {instruments.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-4">
                      You need at least one instrument registered in QC → Instruments before adding a channel.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base sm:text-lg">Instrument Channels</CardTitle>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <ResponsiveTable
                    data={channels}
                    keyExtractor={(ch) => ch.id}
                    isLoading={channelsLoading}
                    onRowClick={(ch) => setSelectedChannel(ch)}
                    columns={[
                      {
                        key: 'name',
                        header: 'Channel',
                        sortable: true,
                        cell: (ch) => (
                          <div>
                            <p className="font-medium">{ch.name}</p>
                            <p className="text-xs text-muted-foreground">{ch.instrument_name}</p>
                          </div>
                        ),
                      },
                      {
                        key: 'protocol',
                        header: 'Protocol',
                        sortable: true,
                        cell: (ch) => <Badge variant="outline">{ch.protocol}</Badge>,
                        hideOnMobile: true,
                      },
                      {
                        key: 'host',
                        header: 'Endpoint',
                        cell: (ch) => (
                          <span className="text-sm font-mono">{ch.host}:{ch.port}</span>
                        ),
                        hideOnMobile: true,
                      },
                      {
                        key: 'connection_status',
                        header: 'Status',
                        sortable: true,
                        cell: (ch) => (
                          <Badge className={statusColors[ch.connection_status] || ''}>
                            {ch.connection_status === 'CONNECTED' && <Wifi className="h-3 w-3 mr-1" />}
                            {ch.connection_status === 'DISCONNECTED' && <WifiOff className="h-3 w-3 mr-1" />}
                            {ch.connection_status === 'ERROR' && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {ch.connection_status_display}
                          </Badge>
                        ),
                      },
                      {
                        key: 'last_activity_at',
                        header: 'Last Activity',
                        sortable: true,
                        sortType: 'date' as const,
                        cell: (ch) =>
                          ch.last_activity_at ? (
                            new Date(ch.last_activity_at).toLocaleString()
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          ),
                        hideOnMobile: true,
                      },
                      {
                        key: 'actions',
                        header: '',
                        cell: (ch) => (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Test connection"
                              onClick={(e) => {
                                e.stopPropagation();
                                testConnection.mutate(ch.id);
                              }}
                            >
                              <Zap className="h-4 w-4" />
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                    mobileCard={(ch) => (
                      <div className="flex items-center justify-between p-3">
                        <div>
                          <p className="font-medium">{ch.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ch.instrument_name} • {ch.protocol}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`shrink-0 ${statusColors[ch.connection_status] || ''}`}>
                            {ch.connection_status_display}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              testConnection.mutate(ch.id);
                            }}
                          >
                            <Zap className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Driver Templates Tab */}
          <TabsContent value="templates" className="mt-4">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Settings2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No driver templates available</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Driver templates provide pre-configured protocol settings for common laboratory analyzers
                    (Sysmex, Roche, Abbott, etc.). Contact your system administrator to load templates.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((tpl) => (
                  <Card key={tpl.id} className="relative overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
                    <CardContent className="relative p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{tpl.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {tpl.manufacturer} • {tpl.category}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {tpl.protocol}
                        </Badge>
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                          {tpl.description}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={channels.length === 0}
                        onClick={() => {
                          if (channels.length === 1 && channels[0]) {
                            applyTemplate.mutate({
                              channelId: channels[0].id,
                              templateId: tpl.id,
                            });
                          } else {
                            setSelectedChannel(null);
                            setShowTemplateDialog(true);
                          }
                        }}
                        title={channels.length === 0 ? 'Create a channel first' : undefined}
                      >
                        <Zap className="h-3 w-3 mr-1.5" />
                        Apply to Channel
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Channel Detail Panel (when a row is clicked) */}
        {selectedChannel && (
          <ChannelDetailPanel
            channel={selectedChannel}
            templates={templates}
            onClose={() => setSelectedChannel(null)}
            onTestConnection={() => testConnection.mutate(selectedChannel.id)}
            onApplyTemplate={(templateId) =>
              applyTemplate.mutate({ channelId: selectedChannel.id, templateId })
            }
          />
        )}

        {/* Add Channel Dialog */}
        <AddChannelDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          instruments={instruments}
          templates={templates}
          onSubmit={(data) => createChannel.mutate(data)}
          isLoading={createChannel.isPending}
        />

        {/* Apply Template to Channel Dialog */}
        <ApplyTemplateDialog
          open={showTemplateDialog}
          onOpenChange={setShowTemplateDialog}
          channels={channels}
          templates={templates}
          onApply={(channelId, templateId) => applyTemplate.mutate({ channelId, templateId })}
          isLoading={applyTemplate.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// Channel Detail Panel
// =============================================================================

function ChannelDetailPanel({
  channel,
  templates,
  onClose,
  onTestConnection,
  onApplyTemplate,
}: {
  channel: InstrumentChannel;
  templates: AnalyzerDriverTemplate[];
  onClose: () => void;
  onTestConnection: () => void;
  onApplyTemplate: (templateId: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">{channel.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {channel.instrument_name} • {protocolLabels[channel.protocol]}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onTestConnection}>
            <Zap className="h-4 w-4 mr-1.5" />
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Endpoint</p>
            <p className="text-sm font-mono">{channel.host}:{channel.port}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Direction</p>
            <p className="text-sm">{channel.direction_display}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <Badge className={statusColors[channel.connection_status] || ''}>
              {channel.connection_status_display}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Encoding</p>
            <p className="text-sm">{channel.encoding || 'utf-8'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Last Activity</p>
            <p className="text-sm">
              {channel.last_activity_at
                ? new Date(channel.last_activity_at).toLocaleString()
                : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Active</p>
            <p className="text-sm">{channel.is_active ? 'Yes' : 'No'}</p>
          </div>
        </div>
        {channel.last_error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-xs font-medium text-destructive mb-1">Last Error</p>
            <p className="text-xs text-destructive/80 font-mono">{channel.last_error}</p>
          </div>
        )}
        {templates.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Apply Driver Template</p>
            <div className="flex flex-wrap gap-2">
              {templates
                .filter((t) => t.protocol === channel.protocol)
                .map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyTemplate(t.id)}
                  >
                    {t.name}
                  </Button>
                ))}
              {templates.filter((t) => t.protocol === channel.protocol).length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No templates available for {channel.protocol} protocol
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Add Channel Dialog
// =============================================================================

function AddChannelDialog({
  open,
  onOpenChange,
  instruments,
  templates,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instruments: Instrument[];
  templates: AnalyzerDriverTemplate[];
  onSubmit: (data: InstrumentChannelCreateData) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    instrument: '',
    name: '',
    protocol: '' as ChannelProtocol | '',
    host: '127.0.0.1',
    port: '9100',
    selectedTemplate: '',
  });

  const handleTemplateSelect = (templateId: string) => {
    const tpl = templates.find((t) => t.id === Number(templateId));
    if (tpl) {
      setFormData((prev) => ({
        ...prev,
        selectedTemplate: templateId,
        protocol: tpl.protocol,
        name: prev.name || tpl.name,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.instrument || !formData.name || !formData.protocol) return;
    onSubmit({
      instrument: Number(formData.instrument),
      name: formData.name,
      protocol: formData.protocol as ChannelProtocol,
      host: formData.host,
      port: Number(formData.port),
    });
  };

  const resetForm = () => {
    setFormData({
      instrument: '',
      name: '',
      protocol: '',
      host: '127.0.0.1',
      port: '9100',
      selectedTemplate: '',
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Analyzer Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Setup from Template */}
          {templates.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Quick Setup (optional)</Label>
              <Select value={formData.selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a driver template to auto-fill..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.manufacturer} — {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Instrument */}
          <div>
            <Label htmlFor="instrument">Instrument *</Label>
            <Select
              value={formData.instrument}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, instrument: v }))}
            >
              <SelectTrigger id="instrument" className="mt-1">
                <SelectValue placeholder="Select instrument..." />
              </SelectTrigger>
              <SelectContent>
                {instruments.map((inst) => (
                  <SelectItem key={inst.id} value={String(inst.id)}>
                    {inst.name}
                    {inst.manufacturer ? ` (${inst.manufacturer})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instruments.length === 0 && (
              <p className="text-xs text-destructive mt-1">
                No instruments found. Register one under QC → Instruments first.
              </p>
            )}
          </div>

          {/* Channel Name */}
          <div>
            <Label htmlFor="channel-name">Channel Name *</Label>
            <Input
              id="channel-name"
              className="mt-1"
              placeholder="e.g. Sysmex XN-1000 Results"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Protocol */}
          <div>
            <Label htmlFor="protocol">Protocol *</Label>
            <Select
              value={formData.protocol}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, protocol: v as ChannelProtocol }))}
            >
              <SelectTrigger id="protocol" className="mt-1">
                <SelectValue placeholder="Select protocol..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ASTM">ASTM E1394 / LIS2-A2</SelectItem>
                <SelectItem value="HL7">HL7 v2.x (MLLP)</SelectItem>
                <SelectItem value="SERIAL">Serial RS-232 (TCP Bridge)</SelectItem>
                <SelectItem value="TCP">Raw TCP/IP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                className="mt-1 font-mono text-sm"
                placeholder="127.0.0.1"
                value={formData.host}
                onChange={(e) => setFormData((prev) => ({ ...prev, host: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                className="mt-1 font-mono text-sm"
                type="number"
                placeholder="9100"
                value={formData.port}
                onChange={(e) => setFormData((prev) => ({ ...prev, port: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.instrument || !formData.name || !formData.protocol}
            >
              {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Create Channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Apply Template Dialog
// =============================================================================

function ApplyTemplateDialog({
  open,
  onOpenChange,
  channels,
  templates,
  onApply,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: InstrumentChannel[];
  templates: AnalyzerDriverTemplate[];
  onApply: (channelId: number, templateId: number) => void;
  isLoading: boolean;
}) {
  const [channelId, setChannelId] = useState('');
  const [templateId, setTemplateId] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Driver Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select channel..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={String(ch.id)}>
                    {ch.name} ({ch.instrument_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.manufacturer} — {t.name} ({t.protocol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!channelId || !templateId || isLoading}
            onClick={() => onApply(Number(channelId), Number(templateId))}
          >
            {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Apply Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
