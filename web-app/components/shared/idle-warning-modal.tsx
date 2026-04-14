'use client';

import { LogOut, MousePointer } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { formatCountdown } from '@/lib/hooks/use-idle-timer';
import { cn } from '@/lib/utils/cn';

interface IdleWarningModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Seconds remaining before auto-logout */
  secondsRemaining: number;
  /** Total warning duration in seconds (for progress bar) */
  totalWarningSeconds?: number;
  /** Called when user clicks "Continue Session" */
  onContinue: () => void;
  /** Called when user explicitly clicks "Logout Now" */
  onLogout?: () => void;
}

/**
 * Modal displayed when user has been idle for the warning threshold.
 * Shows countdown timer and allows user to continue session or logout.
 *
 * DHA Compliance: Frontend Auto-Logoff (P1)
 * - 15 minute warning before 30 minute auto-logout
 * - Clear countdown display
 * - Option to continue session or logout immediately
 */
export function IdleWarningModal({
  isOpen,
  secondsRemaining,
  totalWarningSeconds = 15 * 60, // 15 minutes (time from warning to logout)
  onContinue,
  onLogout,
}: IdleWarningModalProps) {
  // Calculate progress (100% when full time, 0% when about to logout)
  const progressValue = (secondsRemaining / totalWarningSeconds) * 100;

  // Smooth green → amber → red color coding based on percentage remaining
  const timerStroke =
    progressValue > 75 ? 'stroke-emerald-500' :
    progressValue > 50 ? 'stroke-lime-500' :
    progressValue > 30 ? 'stroke-amber-500' :
    progressValue > 15 ? 'stroke-orange-500' :
    'stroke-red-500';
  const timerText =
    progressValue > 75 ? 'text-emerald-600 dark:text-emerald-400' :
    progressValue > 50 ? 'text-lime-600 dark:text-lime-400' :
    progressValue > 30 ? 'text-amber-600 dark:text-amber-400' :
    progressValue > 15 ? 'text-orange-600 dark:text-orange-400' :
    'text-red-600 dark:text-red-400';

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center">
            Session About to Expire
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            You&apos;ve been inactive for a while. For your security, you&apos;ll be
            automatically logged out soon.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Circular Countdown Display */}
        <div className="flex flex-col items-center gap-3 py-4">
          <CircularProgress
            value={progressValue}
            size={100}
            strokeWidth={6}
            indicatorClassName={timerStroke}
            trackClassName="stroke-muted"
          >
            <div className="flex flex-col items-center">
              <span className={cn(
                "text-2xl font-mono font-bold tabular-nums",
                timerText
              )}>
                {formatCountdown(secondsRemaining)}
              </span>
            </div>
          </CircularProgress>
          <p className="text-sm text-muted-foreground">
            Time remaining before logout
          </p>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={onContinue}
            className="w-full"
            size="lg"
          >
            <MousePointer className="mr-2 h-4 w-4" />
            Continue Session
          </Button>
          {onLogout && (
            <Button
              variant="outline"
              onClick={onLogout}
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout Now
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
