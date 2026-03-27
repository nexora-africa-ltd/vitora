'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, Search, Settings, User, RefreshCw, Trash2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AnimatedThemeToggle } from '@/components/ui/animated-theme-toggle';
import StatusIndicator from '@/components/ui/status-indicator';
import { useAuth } from '@/lib/auth/context';
import { useLogout } from '@/lib/auth/hooks';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { useSyncStatus, formatLastSync } from '@/lib/context/sync-context';
import { usePageRefresh, formatLastFetch, formatLastFetchShort } from '@/lib/context/page-refresh-context';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { FacilitySwitcher } from '@/components/layout/facility-switcher';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { clearCacheAndReload } from '@/lib/utils/version-check';
import { useNavigationMode } from '@/lib/context/navigation-mode-context';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMenuClick, sidebarCollapsed }: HeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const logout = useLogout();
  const [headerSearch, setHeaderSearch] = useState('');
  const { isOnline } = useNetworkStatus();
  const { lastSyncTime, isSyncing, pendingChanges, lastError, triggerSync } = useSyncStatus();
  const { lastFetchTime, isRefreshing, refresh } = usePageRefresh();
  const [isClearingCache, setIsClearingCache] = useState(false);
  const { navigationMode, setNavigationMode, isClinicalNavigationEligible } = useNavigationMode();
  const isClinicalMode = navigationMode === 'clinical';

  const handleClearCache = async () => {
    setIsClearingCache(true);
    await clearCacheAndReload();
    // Note: Page will reload, so this state won't persist
  };

  const handleSyncClick = async () => {
    if (!isSyncing && isOnline) {
      await triggerSync();
    }
  };

  const handleRefreshClick = async () => {
    if (!isRefreshing) {
      await refresh();
    }
  };

  const userInitials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || user.username[0]}`.toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-30 w-full h-16 bg-background/95 backdrop-blur border-b">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left side */}
        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
          {/* Mobile menu button - hidden at xl when sidebar always visible */}
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>

          {/* Breadcrumb */}
          <Breadcrumb />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 xl:gap-4">
          {/* Online/Offline indicator */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSyncClick}
                  disabled={isSyncing || !isOnline}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all',
                    'hover:ring-2 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-offset-1',
                    isOnline
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:ring-green-300 dark:hover:ring-green-700'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 cursor-not-allowed',
                    isSyncing && 'opacity-80'
                  )}
                >
                  <StatusIndicator
                    state={isSyncing ? 'fixing' : isOnline ? 'active' : 'down'}
                    size="sm"
                  />
                  {/* Short text on sm-lg screens */}
                  <span className="hidden sm:inline xl:hidden">
                    {isSyncing ? 'Sync' : isOnline ? formatLastFetchShort(lastFetchTime) : 'Off'}
                  </span>
                  {/* Full text on xl+ screens */}
                  <span className="hidden xl:inline">
                    {isSyncing ? 'Syncing...' : isOnline ? formatLastFetch(lastFetchTime) : 'Offline'}
                  </span>
                  {pendingChanges > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1 text-[10px] bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    >
                      {pendingChanges}
                    </Badge>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs bg-popover text-popover-foreground border shadow-md"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <StatusIndicator
                      state={isOnline ? 'active' : 'down'}
                      size="sm"
                    />
                    <span className="font-medium">
                      {isOnline ? 'Connected' : 'No Connection'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isOnline
                      ? 'Changes sync automatically'
                      : 'Changes will sync when online'}
                  </p>
                  <div className="pt-1.5 border-t border-border text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last fetch:</span>
                      <span className="font-medium">{formatLastFetch(lastFetchTime)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-muted-foreground">Last sync:</span>
                      <span className="font-medium">{formatLastSync(lastSyncTime)}</span>
                    </div>
                    {pendingChanges > 0 && (
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Pending:</span>
                        <span className="font-medium text-yellow-600 dark:text-yellow-400">
                          {pendingChanges} change{pendingChanges !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {lastError && (
                      <div className="mt-1 text-destructive">
                        Error: {lastError}
                      </div>
                    )}
                  </div>
                  {isOnline && !isSyncing && (
                    <div className="pt-1.5 border-t border-border">
                      <p className="text-xs text-primary font-medium">
                        Click to sync now
                      </p>
                    </div>
                  )}
                  {isSyncing && (
                    <div className="pt-1.5 border-t border-border">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Syncing in progress...
                      </p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Refresh button (hidden on mobile - they have pull-to-refresh) */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  className="hidden sm:flex h-9 w-9"
                  aria-label="Refresh page data"
                >
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {isRefreshing ? 'Refreshing...' : 'Refresh page data'}
                </p>
                {lastFetchTime && !isRefreshing && (
                  <p className="text-xs text-muted-foreground">
                    Last: {formatLastFetch(lastFetchTime)}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Facility switcher (multi-branch) */}
          <FacilitySwitcher />

          {/* Search (tablet+) - smaller at lg, full width at xl */}
          <form
            className="hidden md:flex relative w-48 lg:w-56 xl:w-64"
            onSubmit={(e) => {
              e.preventDefault();
              const q = headerSearch.trim();
              if (q) {
                router.push(`/patients?search=${encodeURIComponent(q)}`);
                setHeaderSearch('');
              }
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search patients..."
              className="pl-9"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
            />
          </form>

          {/* Notifications */}
          <NotificationPanel />

          {/* Theme toggle */}
          <AnimatedThemeToggle />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 rounded-full"
                data-testid="user-menu"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.first_name || user?.username}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {user?.email || user?.username}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isClinicalNavigationEligible && (
                <>
                  <div className="px-2 py-1.5">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 w-full cursor-default">
                            <Stethoscope className="mr-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <Switch
                              checked={isClinicalMode}
                              onCheckedChange={(checked) =>
                                setNavigationMode(checked ? 'clinical' : 'standard')
                              }
                              aria-label="Toggle clinical navigation mode"
                            />
                            <span className="text-sm font-medium">
                              {isClinicalMode ? 'Clinical Mode' : 'Standard Mode'}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>Switch to {isClinicalMode ? 'Standard' : 'Clinical'} navigation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={handleClearCache}
                disabled={isClearingCache}
                className="text-muted-foreground"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isClearingCache ? 'Clearing...' : 'Clear Cache & Refresh'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
