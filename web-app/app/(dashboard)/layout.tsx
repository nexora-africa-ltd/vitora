'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard, RouteGuard } from '@/lib/auth/guard';
import { SyncProvider } from '@/lib/context/sync-context';
import { AIChatProvider } from '@/lib/context/ai-chat-context';
import { IdleTimerProvider } from '@/components/shared/idle-timer-provider';
import { AIChatWidget } from '@/components/shared/ai-chat-widget';
import { PermissionDebugPanel } from '@/components/shared/permission-debug-panel';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandMenu } from '@/components/layout/command-menu';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { MFAGraceBanner } from '@/components/auth/mfa-grace-banner';
import { OnboardingBanner } from '@/components/auth/onboarding-banner';
import { OfflineBanner } from '@/components/shared/offline-banner';
import { LicenseBanner } from '@/components/shared/license-banner';
import { LicenseGuard } from '@/components/shared/license-guard';
import { GlobalPeekPanel } from '@/components/shared/global-peek-panel';
import { PushNotificationPrompt } from '@/components/notifications/push-notification-prompt';
import { cn } from '@/lib/utils/cn';
import { usePageContextForAI } from '@/lib/hooks/use-page-context-for-ai';
import { useSwipeSidebar } from '@/lib/hooks/use-swipe-sidebar';

/** Invisible component that syncs the current route into AI chat context. */
function AIPageContextSync() {
  usePageContextForAI();
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const openMobileSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  // Swipe left-edge → open, swipe left → close (mobile/tablet only)
  useSwipeSidebar({
    onOpen: openMobileSidebar,
    onClose: closeMobileSidebar,
    isOpen: mobileSidebarOpen,
  });

  // Prevent scroll chaining into the underlying page when the mobile sidebar is open.
  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <AuthGuard>
      <SyncProvider>
        <AIChatProvider>
          <IdleTimerProvider>
            <LicenseGuard>
            <div className="min-h-screen bg-background">
              {/* Sidebar */}
              <Sidebar
                collapsed={sidebarCollapsed}
                onCollapse={setSidebarCollapsed}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={closeMobileSidebar}
              />

              {/* Main content area */}
              <div
                className={cn(
                  'transition-all duration-300',
                  sidebarCollapsed ? 'xl:ml-20' : 'xl:ml-64'
                )}
              >
                {/* Header */}
                <Header
                  onMenuClick={openMobileSidebar}
                  sidebarCollapsed={sidebarCollapsed}
                />

                {/* Page content */}
                <main className="min-h-[calc(100vh-4rem)] p-4 pb-28 md:p-6 md:pb-28 xl:p-8 xl:pb-8">
                  <OfflineBanner />
                  <LicenseBanner />
                  <MFAGraceBanner />
                  <OnboardingBanner />
                  <RouteGuard>{children}</RouteGuard>
                </main>
              </div>

              {/* Mobile sidebar overlay */}
              <div
                className={cn(
                  'fixed inset-0 z-40 bg-black/50 xl:hidden transition-opacity duration-300 ease-out',
                  mobileSidebarOpen
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                )}
                onClick={closeMobileSidebar}
              />

              {/* Mobile bottom navigation (Telegram-style) */}
              <MobileBottomNav hidden={mobileSidebarOpen} />

              {/* Global peek panel (patient/encounter slide-over) */}
              <GlobalPeekPanel />
              {/* TibaBot AI floating widget */}
              <AIChatWidget />
              {/* Global command menu (⌘K / Ctrl+K) */}
              <CommandMenu />
              {/* Permission debug panel (dev only) */}
              <PermissionDebugPanel />
              {/* Sync current page route into AI chat context */}
              <AIPageContextSync />
              {/* Push notification prompt (shows once per session) */}
              <PushNotificationPrompt />
            </div>
            </LicenseGuard>
          </IdleTimerProvider>
        </AIChatProvider>
      </SyncProvider>
    </AuthGuard>
  );
}
