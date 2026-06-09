/**
 * Settings Page
 * System settings and SHA configuration
 * Sprint 1.5-1.6: SHA Integration
 */
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Bell,
  Palette,
  Shield,
  Database,
  Monitor,
} from 'lucide-react';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SHASettingsTab } from '@/components/settings/sha-settings';
import { MFASettingsTab } from '@/components/settings/mfa-settings';
import { FacilitySettingsTab } from '@/components/settings/facility-settings';
import { DischargeTemplateSettings } from '@/components/settings/discharge-template-settings';
import { DHIS2SettingsTab } from '@/components/settings/dhis2-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { DesktopSettingsTab } from '@/components/settings/desktop-settings';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { isDesktop } from '@/lib/desktop';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'security';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showDesktop, setShowDesktop] = useState(false);

  // Detect desktop mode after mount (avoids hydration mismatch)
  useEffect(() => {
    setShowDesktop(isDesktop());
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Settings"
        helpContent="Manage system configuration, security settings, and integrations."
      />

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted h-10 sm:h-11 p-1">
          <TabsTrigger value="security" className="gap-1.5 text-xs sm:text-sm">
            <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">MFA</span>
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="sha" className="gap-1.5 text-xs sm:text-sm">
            <KenyaCoatOfArms size={14} className="sm:w-4 sm:h-4" />
            <span className="sm:hidden">SHA</span>
            <span className="hidden sm:inline">SHA Integration</span>
          </TabsTrigger>
          <TabsTrigger value="facility" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Facility</span>
            <span className="hidden sm:inline">Facility</span>
          </TabsTrigger>
          <TabsTrigger value="dhis2" className="gap-1.5 text-xs sm:text-sm">
            <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">DHIS2</span>
            <span className="hidden sm:inline">DHIS2 / KHIS</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Alerts</span>
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5 text-xs sm:text-sm">
            <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Theme</span>
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          {showDesktop && (
            <TabsTrigger value="desktop" className="gap-1.5 text-xs sm:text-sm">
              <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">Desktop</span>
              <span className="hidden sm:inline">Desktop</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Security Settings (MFA) */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <MFASettingsTab />
        </TabsContent>

        {/* SHA Integration Settings */}
        <TabsContent value="sha" className="space-y-4 mt-4">
          <SHASettingsTab />
        </TabsContent>

        {/* Facility Settings */}
        <TabsContent value="facility" className="space-y-4 mt-4">
          <FacilitySettingsTab />
          <DischargeTemplateSettings />
        </TabsContent>

        {/* DHIS2 / KHIS Settings */}
        <TabsContent value="dhis2" className="space-y-4 mt-4">
          <DHIS2SettingsTab />
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Notification Preferences</CardTitle>
                <HelpPopover content="Configure how you receive alerts for critical events, approvals, and system updates." />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Notification settings will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-4 mt-4">
          <AppearanceSettings />
        </TabsContent>

        {/* Desktop Settings (Tauri only) */}
        {showDesktop && (
          <TabsContent value="desktop" className="space-y-4 mt-4">
            <DesktopSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
