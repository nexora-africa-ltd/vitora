/**
 * Triage Module - Settings Page
 *
 * Configure vital sign thresholds and triage module settings.
 * Admin access required for modifications.
 *
 * Route: /triage/settings
 */
'use client';

import { useCallback, useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TriageThresholdsSettings } from '@/components/triage';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useTriageVitalThresholds,
  useUpdateVitalThreshold,
  useToggleThresholdActive,
  useResetThresholdToDefault,
  useResetAllThresholdsToDefaults,
  useExportThresholds,
  useImportThresholds,
  useTriageSettings,
  useUpdateTriageSettings,
  useAvailableTriageRooms,
} from '@/lib/hooks/use-triage';
import { useDepartments } from '@/lib/hooks/use-rbac';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageVitalThreshold } from '@/lib/types/triage';

export default function TriageSettingsPage() {
  const { hasPermission } = usePermissions();
  const { facility } = useFacility();

  // Check permission - usePermissions handles superusers/admins automatically
  const canEdit = hasPermission('triage.change_triageVitalthreshold');

  // Fetch thresholds
  const {
    data: thresholds,
    isLoading,
    refetch,
  } = useTriageVitalThresholds();

  // Triage room routing settings — wait for facility context
  const hasFacility = !!facility;
  const { data: triageSettings, isLoading: isSettingsLoading, isError: isSettingsError } = useTriageSettings({ enabled: hasFacility });
  const { mutateAsync: updateTriageSettings } = useUpdateTriageSettings();
  const { data: availableRooms } = useAvailableTriageRooms({ enabled: !!triageSettings?.auto_route_to_room });
  const { data: allDepartments } = useDepartments({ is_active: true, page_size: 100 });

  // Mutations
  const { mutateAsync: updateThreshold } = useUpdateVitalThreshold();
  const { mutateAsync: toggleActive } = useToggleThresholdActive();
  const { mutateAsync: resetToDefault } = useResetThresholdToDefault();
  const { mutateAsync: resetAllToDefaults } = useResetAllThresholdsToDefaults();
  const { mutateAsync: exportThresholds } = useExportThresholds();
  const { mutateAsync: importThresholds } = useImportThresholds();

  const handleSave = useCallback(
    async (threshold: Partial<TriageVitalThreshold> & { id: number }) => {
      try {
        // We need to fetch the full threshold and merge
        const fullThreshold = thresholds?.find(t => t.id === threshold.id);
        if (!fullThreshold) {
          throw new Error('Threshold not found');
        }
        await updateThreshold({ ...fullThreshold, ...threshold });
        toast({
          title: 'Threshold Updated',
          description: `${threshold.vital_type ?? 'Threshold'} has been saved.`,
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to save threshold. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [updateThreshold, refetch, thresholds]
  );

  const handleToggleActive = useCallback(
    async (id: number, isActive: boolean) => {
      try {
        await toggleActive({ id, isActive });
        toast({
          title: isActive ? 'Threshold Activated' : 'Threshold Deactivated',
          description: isActive
            ? 'Alerts will now be generated for this vital.'
            : 'Alerts will no longer be generated for this vital.',
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update threshold status.',
          variant: 'destructive',
        });
      }
    },
    [toggleActive, refetch]
  );

  const handleReset = useCallback(
    async (id: number) => {
      try {
        await resetToDefault(id);
        toast({
          title: 'Reset Complete',
          description: 'Threshold has been reset to system defaults.',
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to reset threshold.',
          variant: 'destructive',
        });
      }
    },
    [resetToDefault, refetch]
  );

  const handleExport = useCallback(async () => {
    try {
      const blob = await exportThresholds();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `triage-thresholds-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({
        title: 'Export Complete',
        description: 'Threshold configuration has been downloaded.',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export thresholds.',
        variant: 'destructive',
      });
    }
  }, [exportThresholds]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importThresholds(data);
        toast({
          title: 'Import Complete',
          description: 'Threshold configuration has been imported.',
        });
        refetch();
      } catch (error) {
        toast({
          title: 'Import Failed',
          description: 'Failed to import thresholds. Please check the file format.',
          variant: 'destructive',
        });
      }
    },
    [importThresholds, refetch]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Settings"
        helpContent="Configure vital sign thresholds and alert rules for your facility."
      />

      <Tabs defaultValue="thresholds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="thresholds">Vital Thresholds</TabsTrigger>
          <TabsTrigger value="general">General Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds">
          <TriageThresholdsSettings
            thresholds={thresholds ?? []}
            isLoading={isLoading}
            canEdit={canEdit}
            onSave={handleSave}
            onToggleActive={handleToggleActive}
            onReset={handleReset}
            onExport={handleExport}
            onImport={handleImport}
          />
        </TabsContent>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Room Routing</CardTitle>
                <HelpPopover content="When enabled, patients are automatically assigned to a triage room at check-in. The system selects a room with available capacity and an active (clocked-in) staff member. You can also assign rooms manually from the queue." />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isSettingsLoading || (!hasFacility && !isSettingsError) ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !hasFacility ? (
                <p className="text-sm text-muted-foreground">
                  No facility context available. Ensure your account is assigned to a facility.
                </p>
              ) : isSettingsError ? (
                <p className="text-sm text-destructive">
                  Failed to load triage settings. Please try refreshing the page.
                </p>
              ) : triageSettings ? (
                <>
                  {/* Auto-routing toggle */}
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-route" className="text-sm font-medium">
                        Auto-route to triage rooms
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically assign patients to a triage room when they check in.
                        Rooms must have available capacity and an active staff member.
                      </p>
                    </div>
                    <Switch
                      id="auto-route"
                      checked={triageSettings.auto_route_to_room}
                      onCheckedChange={async (checked) => {
                        try {
                          await updateTriageSettings({
                            id: triageSettings.id,
                            data: { auto_route_to_room: checked },
                          });
                          toast({
                            title: checked ? 'Auto-routing Enabled' : 'Auto-routing Disabled',
                            description: checked
                              ? 'Patients will be assigned to triage rooms at check-in.'
                              : 'Room assignment will be manual only.',
                          });
                        } catch {
                          toast({
                            title: 'Error',
                            description: 'Failed to update setting.',
                            variant: 'destructive',
                          });
                        }
                      }}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Triage department selector */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Triage Department
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Only rooms (PLACE resources) assigned to this department are considered for triage routing.
                    </p>
                    <Select
                      value={triageSettings.triage_department?.toString() ?? 'none'}
                      onValueChange={async (value) => {
                        try {
                          await updateTriageSettings({
                            id: triageSettings.id,
                            data: { triage_department: value === 'none' ? null : parseInt(value) },
                          });
                          toast({
                            title: 'Department updated',
                            description: value === 'none'
                              ? 'Triage department cleared.'
                              : 'Triage department updated. Rooms in this department will be used for routing.',
                          });
                        } catch {
                          toast({
                            title: 'Error',
                            description: 'Failed to update triage department.',
                            variant: 'destructive',
                          });
                        }
                      }}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(allDepartments?.results ?? []).map((dept) => (
                          <SelectItem key={dept.id} value={dept.id.toString()}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Room overview (when auto-routing is on) */}
                  {triageSettings.auto_route_to_room && availableRooms && availableRooms.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Active Triage Rooms</Label>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {availableRooms.map((room) => (
                          <div
                            key={room.id}
                            className={`flex items-center justify-between rounded-lg border p-3 ${
                              room.is_available
                                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                                : 'border-muted'
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium">{room.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {room.current_load}/{room.capacity} patients
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {room.has_active_staff ? (
                                <Badge variant="default" className="text-[10px] h-5">Staff active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">No staff</Badge>
                              )}
                              {room.is_available ? (
                                <Badge variant="default" className="text-[10px] h-5 bg-green-600">Available</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Unavailable</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No triage settings found for your facility.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
