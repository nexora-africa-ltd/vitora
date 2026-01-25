'use client';

import { Menu, Search, User, RefreshCw } from 'lucide-react';
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
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMenuClick, sidebarCollapsed }: HeaderProps) {
  const { user } = useAuth();
  const logout = useLogout();
  const { isOnline } = useNetworkStatus();
  const { lastSyncTime, isSyncing, pendingChanges, lastError, triggerSync } = useSyncStatus();

  const handleSyncClick = async () => {
    if (!isSyncing && isOnline) {
      await triggerSync();
    }
  };

  const userInitials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || user.username[0]}`.toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur border-b mt-2">
      <div className="flex h-full items-center justify-between px-4 md:px-6 mt-2">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
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
        <div className="flex items-center gap-2 md:gap-4">
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
                  <span className="hidden sm:inline">
                    {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
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

          {/* Search (desktop) */}
          <div className="hidden md:flex relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search patients..."
              className="pl-9"
            />
          </div>

          {/* Notifications */}
          <NotificationPanel />

          {/* Theme toggle */}
          <AnimatedThemeToggle />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
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
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
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
