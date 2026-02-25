'use client';

import { Clock, LogOut, MousePointer } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  
  // Determine urgency level for visual feedback
  const isUrgent = secondsRemaining <= 60; // Last minute
  const isCritical = secondsRemaining <= 30; // Last 30 seconds

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-2">
            <Clock className={cn(
              "h-6 w-6",
              isCritical ? "text-red-600 dark:text-red-400 animate-pulse" :
              isUrgent ? "text-amber-600 dark:text-amber-400" :
              "text-amber-600 dark:text-amber-400"
            )} />
          </div>
          <AlertDialogTitle className="text-center">
            Session About to Expire
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            You&apos;ve been inactive for a while. For your security, you&apos;ll be 
            automatically logged out soon.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Countdown Display */}
        <div className="space-y-4 py-4">
          <div className="text-center">
            <div className={cn(
              "text-4xl font-mono font-bold tabular-nums",
              isCritical ? "text-red-600 dark:text-red-400" :
              isUrgent ? "text-amber-600 dark:text-amber-400" :
              "text-foreground"
            )}>
              {formatCountdown(secondsRemaining)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Time remaining before logout
            </p>
          </div>

          {/* Progress Bar */}
          <Progress 
            value={progressValue} 
            className={cn(
              "h-2",
              isCritical && "[&>div]:bg-red-600",
              isUrgent && !isCritical && "[&>div]:bg-amber-500"
            )}
          />
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
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
