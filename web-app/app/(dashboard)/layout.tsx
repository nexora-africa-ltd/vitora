'use client';

import { AuthGuard } from '@/lib/auth/guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Main content area */}
        <div className="container mx-auto">
          {/* Header - temporary simple version */}
          <header className="border-b">
            <div className="flex h-16 items-center px-4">
              <div className="ml-auto flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Vitora HMIS</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
