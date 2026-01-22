/**
 * Settings Page
 * System settings and SHA configuration
 * Sprint 1.5-1.6: SHA Integration
 */
'use client';

import { useState } from 'react';
import {
  Settings,
  Building2,
  User,
  Bell,
  Palette,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SHASettingsTab } from '@/components/settings/sha-settings';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('sha');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage system configuration and integrations
          </p>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="sha" className="gap-2">
            <KenyaCoatOfArms size={16} />
            SHA Integration
          </TabsTrigger>
          <TabsTrigger value="facility" className="gap-2">
            <Building2 className="h-4 w-4" />
            Facility
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        {/* SHA Integration Settings */}
        <TabsContent value="sha" className="space-y-4">
          <SHASettingsTab />
        </TabsContent>

        {/* Facility Settings */}
        <TabsContent value="facility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Facility Information</CardTitle>
              <CardDescription>
                Basic information about your healthcare facility
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Facility settings will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Notification settings will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Appearance settings will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
