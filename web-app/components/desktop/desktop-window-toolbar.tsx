// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Frameless Tauri window controls for non-workspace routes.
 * Render on login and onboarding pages; it has no inputs or configuration.
 */

'use client';

import { Maximize2, Minus, X } from 'lucide-react';
import {
  closeDesktopWindow,
  dragDesktopWindow,
  isDesktop,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
} from '@/lib/desktop';

export function DesktopWindowToolbar() {
  if (!isDesktop()) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-9 select-none">
      <div
        aria-hidden="true"
        className="flex-1"
        onDoubleClick={() => void toggleMaximizeDesktopWindow()}
        onMouseDown={(event) => {
          if (event.button === 0) void dragDesktopWindow();
        }}
      />
      <div className="flex bg-background/80 text-foreground backdrop-blur-sm">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={() => void minimizeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-muted"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onClick={() => void toggleMaximizeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-muted"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={() => void closeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
