'use client';

import { useState } from 'react';
import { AuthGuard } from '@/lib/auth/guard';
import { SyncProvider } from '@/lib/context/sync-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils/cn';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <AuthGuard>
      <SyncProvider>
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
              sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
            )}
          >
            {/* Header */}
            <Header
              onMenuClick={() => setMobileSidebarOpen(true)}
              sidebarCollapsed={sidebarCollapsed}
            />

            {/* Page content */}
            <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </div>

          {/* Mobile sidebar overlay */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </div>
      </SyncProvider>
    </AuthGuard>
  );
}
