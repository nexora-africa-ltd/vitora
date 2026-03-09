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
import { useMutation, useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { MODULE_PERMISSIONS, type ModuleKey } from '@/lib/permissions/constants';
import { ACTION_PERMISSIONS, type ActionKey } from '@/lib/permissions/actions';
import { facilitiesApi, toUserFacility } from '@/lib/api/facilities';
import { Bug, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function PermissionDebugPanel() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'modules' | 'actions' | 'facility'>('modules');
  const [filter, setFilter] = useState('');
  const { role, roleCategory, isSuperuser, canAccessModule, canPerformAction, isAuthenticated } = usePermissions();
  const {
    facility,
    assignedFacility,
    facilityOverride,
    isUsingFacilityOverride,
    hasModule,
    setFacilityOverride,
    clearFacilityOverride,
  } = useFacility();

  const moduleKeys = Object.keys(MODULE_PERMISSIONS) as ModuleKey[];
  const actionKeys = Object.keys(ACTION_PERMISSIONS) as ActionKey[];
  const lowerFilter = filter.toLowerCase();

  const filteredModuleKeys = lowerFilter
    ? moduleKeys.filter((k) => k.toLowerCase().includes(lowerFilter))
    : moduleKeys;

  const filteredActionKeys = lowerFilter
    ? actionKeys.filter((k) => k.toLowerCase().includes(lowerFilter))
    : actionKeys;

  const filteredFacilityEntries = facility
    ? Object.entries(facility.modules).filter(([k]) =>
        lowerFilter ? k.toLowerCase().includes(lowerFilter) : true,
      )
    : [];

  const facilitiesQuery = useQuery({
    queryKey: ['debug-facilities'],
    queryFn: () => facilitiesApi.list({ page_size: 100, ordering: 'name' }),
    enabled: isDevelopment && isAuthenticated && open,
  });

  const switchFacilityMutation = useMutation({
    mutationFn: async (facilityId: number) => facilitiesApi.get(facilityId),
    onSuccess: (selectedFacility) => {
      setFacilityOverride(toUserFacility(selectedFacility));
    },
  });

  const handleFacilitySelection = async (value: string) => {
    if (value === 'assigned') {
      clearFacilityOverride();
      return;
    }

    await switchFacilityMutation.mutateAsync(Number(value));
  };

  // Only show in development
  if (!isDevelopment) return null;
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

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex h-[60vh] w-80 flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
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
        {isUsingFacilityOverride && facilityOverride && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mode:</span>
            <Badge variant="secondary" className="text-[10px]">OVERRIDE</Badge>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['modules', 'actions', 'facility'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setFilter(''); }}
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

      {/* Filter */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${activeTab}...`}
            className="h-7 text-xs pl-7 pr-7"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2 space-y-1">
          {activeTab === 'modules' && filteredModuleKeys.map((key) => {
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

          {activeTab === 'actions' && filteredActionKeys.map((key) => {
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
              <div className="space-y-2 rounded-md border border-primary/10 bg-muted/20 p-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Development facility switcher
                </p>
                <Select
                  value={isUsingFacilityOverride && facilityOverride ? String(facilityOverride.id) : 'assigned'}
                  onValueChange={(value) => void handleFacilitySelection(value)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select facility context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assigned">
                      {assignedFacility ? `Assigned: ${assignedFacility.name}` : 'Assigned: none'}
                    </SelectItem>
                    {facilitiesQuery.data?.results.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Switches the effective facility context in development only. Current: {facility?.name || 'none'}
                </p>
              </div>

              {!facility ? (
                <p className="text-xs text-muted-foreground p-2">No facility assigned — all modules allowed.</p>
              ) : filteredFacilityEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No matching modules.</p>
              ) : (
                filteredFacilityEntries.map(([key, enabled]) => {
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

          {activeTab === 'modules' && filteredModuleKeys.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No matching modules.</p>
          )}
          {activeTab === 'actions' && filteredActionKeys.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No matching actions.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
