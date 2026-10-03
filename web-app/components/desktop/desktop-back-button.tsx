// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Floating history-back control for the desktop dashboard shell.
 * Render with the current persistent sidebar state; it has no other inputs.
 */

'use client';

import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { isDesktop } from '@/lib/desktop';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function DesktopBackButton({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const router = useRouter();

  if (!isDesktop()) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Go back"
            onClick={() => router.back()}
            className={`fixed bottom-6 left-4 z-[58] flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/30 bg-background shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              sidebarCollapsed ? 'xl:left-24' : 'xl:left-[17rem]'
            }`}
          >
            <Undo2 className="h-6 w-6" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Back</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
