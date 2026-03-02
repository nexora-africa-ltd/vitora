'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/lib/auth/guard';
import { SyncProvider } from '@/lib/context/sync-context';
import { AIChatProvider } from '@/lib/context/ai-chat-context';
import { IdleTimerProvider } from '@/components/shared/idle-timer-provider';
import { AIChatWidget } from '@/components/shared/ai-chat-widget';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils/cn';
import { usePageContextForAI } from '@/lib/hooks/use-page-context-for-ai';

/** Invisible component that syncs the current route into AI chat context. */
function AIPageContextSync() {
  usePageContextForAI();
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
            <div className="min-h-screen bg-background">
              {/* Sidebar */}
              <Sidebar
                collapsed={sidebarCollapsed}
                onCollapse={setSidebarCollapsed}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={() => setMobileSidebarOpen(false)}
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
                  onMenuClick={() => setMobileSidebarOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                />

                {/* Page content */}
                <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 xl:p-8">
                  {children}
                </main>
              </div>

              {/* Mobile sidebar overlay */}
              {mobileSidebarOpen && (
                <div
                  className="fixed inset-0 z-40 bg-black/50 xl:hidden"
                  onClick={() => setMobileSidebarOpen(false)}
                />
              )}

              {/* TibaBot AI floating widget */}
              <AIChatWidget />
              {/* Sync current page route into AI chat context */}
              <AIPageContextSync />
            </div>
          </IdleTimerProvider>
        </AIChatProvider>
      </SyncProvider>
    </AuthGuard>
  );
}
