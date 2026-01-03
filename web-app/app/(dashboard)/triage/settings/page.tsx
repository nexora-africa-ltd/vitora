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
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, RotateCcw, Download, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TriageThresholdsSettings } from '@/components/triage';
import {
  useTriageVitalThresholds,
  useUpdateVitalThreshold,
  useToggleThresholdActive,
  useResetThresholdToDefault,
  useResetAllThresholdsToDefaults,
  useExportThresholds,
  useImportThresholds,
} from '@/lib/hooks/use-triage';
import { useAuth } from '@/lib/auth/hooks';
import { useToast } from '@/components/ui/use-toast';
import type { TriageVitalThreshold } from '@/lib/types/triage';

export default function TriageSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, hasPermission } = useAuth();

  const canEdit = hasPermission('triage.change_triageVitalthreshold');

  // Fetch thresholds
  const {
    data: thresholds,
    isLoading,
    refetch,
  } = useTriageVitalThresholds();

  // Mutations
  const { mutateAsync: updateThreshold } = useUpdateVitalThreshold();
  const { mutateAsync: toggleActive } = useToggleThresholdActive();
  const { mutateAsync: resetToDefault } = useResetThresholdToDefault();
  const { mutateAsync: resetAllToDefaults } = useResetAllThresholdsToDefaults();
  const { mutateAsync: exportThresholds } = useExportThresholds();
  const { mutateAsync: importThresholds } = useImportThresholds();

  const handleSaveThreshold = useCallback(
    async (threshold: TriageVitalThreshold) => {
      try {
        await updateThreshold(threshold);
        toast({
          title: 'Threshold Updated',
          description: `${threshold.vital_type} threshold has been saved.`,
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
    [updateThreshold, refetch, toast]
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
    [toggleActive, refetch, toast]
  );

  const handleResetToDefault = useCallback(
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
    [resetToDefault, refetch, toast]
  );

  const handleResetAllToDefaults = useCallback(async () => {
    try {
      await resetAllToDefaults();
      toast({
        title: 'All Thresholds Reset',
        description: 'All thresholds have been reset to system defaults.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reset thresholds.',
        variant: 'destructive',
      });
    }
  }, [resetAllToDefaults, refetch, toast]);

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
  }, [exportThresholds, toast]);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

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
    };
    input.click();
  }, [importThresholds, refetch, toast]);

  const handleBack = useCallback(() => {
    router.push('/triage');
  }, [router]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Settings"
        description="Configure vital sign thresholds and alert rules"
        breadcrumbs={[
          { label: 'Triage', href: '/triage' },
          { label: 'Settings', href: '/triage/settings' },
        ]}
        actions={
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
        }
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
            onSaveThreshold={handleSaveThreshold}
            onToggleActive={handleToggleActive}
            onResetToDefault={handleResetToDefault}
            onResetAllToDefaults={handleResetAllToDefaults}
            onExport={handleExport}
            onImport={handleImport}
          />
        </TabsContent>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure general triage module behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                General settings will be available in a future update.
                Current settings are managed via the backend configuration.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
