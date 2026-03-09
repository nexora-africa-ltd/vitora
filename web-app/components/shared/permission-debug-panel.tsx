'use client';

/**
 * Permission Debug Panel (development only)
 *
 * Shows current user permissions, role, facility modules, and allows
 * testing which actions/modules the user can access.
 *
 * Only rendered when NODE_ENV === 'development'.
 */

import { useState } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { MODULE_PERMISSIONS, type ModuleKey } from '@/lib/permissions/constants';
import { ACTION_PERMISSIONS, type ActionKey } from '@/lib/permissions/actions';
import { Bug, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export function PermissionDebugPanel() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'modules' | 'actions' | 'facility'>('modules');
  const { role, roleCategory, isSuperuser, canAccessModule, canPerformAction, isAuthenticated } = usePermissions();
  const { facility, hasModule } = useFacility();

  // Only show in development
  if (process.env.NODE_ENV !== 'development') return null;
  if (!isAuthenticated) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-amber-500 text-white rounded-full p-2 shadow-lg hover:bg-amber-600 transition-colors"
        title="Permission Debug Panel"
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }

  const moduleKeys = Object.keys(MODULE_PERMISSIONS) as ModuleKey[];
  const actionKeys = Object.keys(ACTION_PERMISSIONS) as ActionKey[];

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-80 max-h-[60vh] bg-background border rounded-lg shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">RBAC Debug</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-6 w-6 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* User Info */}
      <div className="p-3 text-xs space-y-1 border-b">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Role:</span>
          <Badge variant="outline" className="text-xs">{role || 'none'}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Category:</span>
          <span>{roleCategory || 'none'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Superuser:</span>
          <span>{isSuperuser ? '✓ Yes' : '✗ No'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Facility:</span>
          <span className="text-right truncate max-w-[160px]">{facility?.name || 'None'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['modules', 'actions', 'facility'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-2 capitalize ${
              activeTab === tab
                ? 'border-b-2 border-primary font-medium'
                : 'text-muted-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 max-h-[300px]">
        <div className="p-2 space-y-1">
          {activeTab === 'modules' && moduleKeys.map((key) => {
            const allowed = canAccessModule(key);
            return (
              <div key={key} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                <span className="font-mono">{key}</span>
                <Badge variant={allowed ? 'default' : 'secondary'} className={`text-[10px] ${allowed ? 'bg-green-500' : 'bg-red-500 text-white'}`}>
                  {allowed ? 'ALLOW' : 'DENY'}
                </Badge>
              </div>
            );
          })}

          {activeTab === 'actions' && actionKeys.map((key) => {
            const allowed = canPerformAction(key);
            return (
              <div key={key} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                <span className="font-mono truncate max-w-[180px]">{key}</span>
                <Badge variant={allowed ? 'default' : 'secondary'} className={`text-[10px] shrink-0 ${allowed ? 'bg-green-500' : 'bg-red-500 text-white'}`}>
                  {allowed ? 'ALLOW' : 'DENY'}
                </Badge>
              </div>
            );
          })}

          {activeTab === 'facility' && (
            <>
              {!facility ? (
                <p className="text-xs text-muted-foreground p-2">No facility assigned — all modules allowed.</p>
              ) : (
                Object.entries(facility.modules).map(([key, enabled]) => {
                  const gateResult = hasModule(key as any);
                  return (
                    <div key={key} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                      <span className="font-mono">{key}</span>
                      <Badge variant={gateResult ? 'default' : 'secondary'} className={`text-[10px] ${gateResult ? 'bg-green-500' : 'bg-red-500 text-white'}`}>
                        {enabled ? 'ON' : 'OFF'}
                      </Badge>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
