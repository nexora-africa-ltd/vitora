'use client';

import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { APP_ENV } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/cn';

interface DemoBannerProps {
  /** Override the default facility name */
  facilityName?: string;
  /** Override display logic (for testing) */
  forceShow?: boolean;
  /** Callback when banner is dismissed */
  onDismiss?: () => void;
}

/**
 * Demo Mode Banner
 * 
 * Displays a prominent banner when the app is running in staging/demo mode.
 * This helps stakeholders understand they're viewing a demo environment
 * and not a production system.
 * 
 * Appears automatically when:
 * - NEXT_PUBLIC_ENV = 'staging'
 * - NEXT_PUBLIC_DEMO_MODE = 'true'
 */
export function DemoBanner({ 
  facilityName, 
  forceShow = false,
  onDismiss 
}: DemoBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check sessionStorage for previously dismissed banner
    const dismissed = sessionStorage.getItem('demoBannerDismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Determine if we should show the banner
  const isDemo = forceShow || 
    APP_ENV === 'staging' || 
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  // Don't render on server or if not demo mode or if dismissed
  if (!mounted || !isDemo || isDismissed) {
    return null;
  }

  const demoFacility = facilityName || 
    process.env.NEXT_PUBLIC_DEMO_FACILITY || 
    'Demo Health Facility';

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('demoBannerDismissed', 'true');
    onDismiss?.();
  };

  return (
    <div
      role="banner"
      aria-label="Demo mode notification"
      className={cn(
        'fixed top-0 left-0 right-0 z-[110]',
        'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500',
        'text-white shadow-lg',
        'animate-in slide-in-from-top duration-300'
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-2.5">
          {/* Left: Warning icon and message */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold text-sm sm:text-base">
                Demo Mode
              </span>
              <span className="hidden sm:inline text-white/80">|</span>
              <span className="text-xs sm:text-sm text-white/90">
                {demoFacility} - For workflow demonstration only
              </span>
            </div>
          </div>

          {/* Right: Feedback link and dismiss button */}
          <div className="flex items-center gap-2">
            {/* Feedback link - shown on larger screens */}
            <a
              href="https://forms.gle/YOUR_FEEDBACK_FORM_ID"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'hidden md:flex items-center gap-1.5',
                'px-3 py-1.5 rounded-full',
                'bg-white/20 hover:bg-white/30',
                'text-sm font-medium',
                'transition-colors'
              )}
            >
              <span>Share Feedback</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {/* Dismiss button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 hover:bg-white/20 text-white"
              aria-label="Dismiss demo banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Animated stripe at bottom */}
      <div className="h-1 bg-gradient-to-r from-amber-300 via-orange-400 to-amber-300 bg-[length:200%_100%] animate-pulse" />
    </div>
  );
}

/**
 * Demo Watermark
 * 
 * A subtle watermark overlay for screenshots and screen recordings.
 * Helps identify demo content when shared.
 */
export function DemoWatermark() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDemo = APP_ENV === 'staging' || 
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  if (!mounted || !isDemo) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[100]',
        'px-3 py-1.5 rounded-full',
        'bg-amber-500/10 border border-amber-500/20',
        'text-amber-600 dark:text-amber-400',
        'text-xs font-medium',
        'pointer-events-none select-none',
        'print:hidden'
      )}
    >
      DEMO ENVIRONMENT
    </div>
  );
}
