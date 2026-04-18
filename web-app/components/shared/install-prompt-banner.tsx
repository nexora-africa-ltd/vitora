'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/utils/constants';

const INSTALL_PROMPT_STORAGE_KEY = 'vitora_pwa_install_prompt_state';
const FALLBACK_HINT_DELAY_MS = 1500;

/** Routes where install banner should not render */
const HIDDEN_PATHS = ['/login', '/signup', '/onboarding', '/setup'];

type InstallPromptState = 'seen' | 'dismissed' | 'installed';
type BannerMode = 'prompt' | 'hint';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (typeof navigator !== 'undefined' && 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function getFallbackInstallHint() {
  if (typeof navigator === 'undefined') {
    return 'Use your browser menu to install this app on your device.';
  }

  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|EdgiOS|FxiOS|OPiOS/i.test(userAgent);

  if (isIOS && isSafari) {
    return 'On iPhone or iPad, tap Share, then choose Add to Home Screen.';
  }

  return 'Use your browser menu to install this app or add it to your home screen.';
}

function getStoredInstallPromptState(): InstallPromptState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY) as InstallPromptState | null;
}

function shouldShowFallbackInstallHint() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|EdgiOS|FxiOS|OPiOS/i.test(userAgent);

  if (isIOS && isSafari) {
    return true;
  }

  return !/Chrome|Chromium|Edg|OPR|SamsungBrowser/i.test(userAgent);
}

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [bannerMode, setBannerMode] = useState<BannerMode>('prompt');
  const [fallbackHint, setFallbackHint] = useState('');
  const hintTimerRef = useRef<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || isStandaloneMode()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }

      setBannerMode('prompt');
      setDeferredPrompt(promptEvent);
      setFallbackHint('');

      if (!getStoredInstallPromptState()) {
        window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, 'seen');
        setIsVisible(true);
      }
    };

    const handleInstalled = () => {
      window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, 'installed');
      setDeferredPrompt(null);
      setIsVisible(false);
    };

    if (!getStoredInstallPromptState() && shouldShowFallbackInstallHint()) {
      hintTimerRef.current = window.setTimeout(() => {
        if (getStoredInstallPromptState()) {
          return;
        }

        setBannerMode('hint');
        setFallbackHint(getFallbackInstallHint());
        window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, 'seen');
        setIsVisible(true);
      }, FALLBACK_HINT_DELAY_MS);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }

      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, 'dismissed');
    }

    setIsVisible(false);
    setDeferredPrompt(null);
  };

  const handleInstall = async () => {
    if (!deferredPrompt || bannerMode !== 'prompt') {
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          INSTALL_PROMPT_STORAGE_KEY,
          choice.outcome === 'accepted' ? 'installed' : 'dismissed'
        );
      }

      setIsVisible(false);
      setDeferredPrompt(null);
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isVisible || (bannerMode === 'prompt' && !deferredPrompt) || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <div className="fixed inset-x-2 bottom-20 z-[95] sm:inset-x-4 sm:bottom-24 md:bottom-6 xl:left-auto xl:right-6 xl:w-full xl:max-w-md">
      <div className="relative overflow-hidden rounded-xl border border-brand-burgundy-200/70 bg-background/95 p-3 shadow-2xl backdrop-blur sm:rounded-2xl sm:p-4 dark:border-brand-burgundy-900/60">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(21,96,115,0.12),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(78,11,24,0.12),transparent_38%)]"
          aria-hidden="true"
        />
        <div className="relative flex items-start gap-2.5 sm:gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal-50 text-brand-teal-700 sm:h-10 sm:w-10 sm:rounded-xl dark:bg-brand-teal-950/40 dark:text-brand-teal-300">
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground sm:text-sm">Install {APP_NAME}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:mt-1 sm:text-sm sm:leading-6">
              {bannerMode === 'prompt'
                ? 'Add Vitora to this device for faster launch and a more app-like workspace.'
                : fallbackHint}
            </p>
            <div className="mt-3 flex flex-col gap-1.5 sm:mt-4 sm:flex-row sm:gap-2">
              {bannerMode === 'prompt' ? (
                <Button size="sm" onClick={handleInstall} disabled={isInstalling} className="text-xs sm:w-auto sm:text-sm">
                  {isInstalling ? 'Opening install prompt...' : 'Install Vitora'}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={handleDismiss} className="text-xs sm:w-auto sm:text-sm">
                {bannerMode === 'prompt' ? 'Not now' : 'Got it'}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="-mr-0.5 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { FALLBACK_HINT_DELAY_MS, INSTALL_PROMPT_STORAGE_KEY };
