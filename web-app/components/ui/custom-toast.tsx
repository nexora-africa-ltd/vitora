"use client"

/**
 * Custom Toast Component with Progress Bar
 *
 * A reusable toast component with animated progress bar indicator.
 * Use this when you need visual feedback on toast duration.
 *
 * Usage:
 *   import { showProgressToast } from '@/components/ui/custom-toast';
 *   showProgressToast.success('Saved!', 'All changes synced.');
 *   showProgressToast.error('Failed', 'Please try again.');
 */

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/index"

export type ToastType = "success" | "error" | "warning" | "info"

interface CustomToastProps {
  id: string | number
  type: ToastType
  message: string
  description?: string
  duration?: number
}

const config: Record<
  ToastType,
  { icon: React.ElementType; progressColor: string; iconColor: string; bgTint: string }
> = {
  success: {
    icon: CircleCheckIcon,
    progressColor: "bg-green-500",
    iconColor: "text-green-500",
    bgTint: "bg-green-500/10",
  },
  error: {
    icon: OctagonXIcon,
    progressColor: "bg-red-500",
    iconColor: "text-red-500",
    bgTint: "bg-red-500/10",
  },
  warning: {
    icon: TriangleAlertIcon,
    progressColor: "bg-amber-500",
    iconColor: "text-amber-500",
    bgTint: "bg-amber-500/10",
  },
  info: {
    icon: InfoIcon,
    progressColor: "bg-blue-500",
    iconColor: "text-blue-500",
    bgTint: "bg-blue-500/10",
  },
}

export function CustomToast({
  id,
  type,
  message,
  description,
  duration = 4000,
}: CustomToastProps) {
  const [progress, setProgress] = useState(100)
  const { icon: Icon, progressColor, iconColor, bgTint } = config[type]

  useEffect(() => {
    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (remaining === 0) {
        clearInterval(interval)
        toast.dismiss(id)
      }
    }, 16)

    return () => clearInterval(interval)
  }, [duration, id])

  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 text-popover-foreground shadow-lg",
        "border-l-4 backdrop-blur-sm",
        bgTint,
        type === "success" && "border-l-green-500",
        type === "error" && "border-l-red-500",
        type === "warning" && "border-l-amber-500",
        type === "info" && "border-l-blue-500",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconColor)} />

      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium leading-tight">{message}</p>
        {description && (
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {description}
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => toast.dismiss(id)}
        className="size-6 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
      >
        <XIcon className="size-4" />
      </Button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
        <div
          className={cn(
            "h-full transition-all ease-linear",
            progressColor,
          )}
          style={{ width: `${progress}%`, transitionDuration: '16ms' }}
        />
      </div>
    </div>
  )
}

// -------------------- Helper Functions --------------------

interface ProgressToastOptions {
  duration?: number
}

/**
 * Show a custom toast with progress bar
 */
function showCustomToast(
  type: ToastType,
  message: string,
  description?: string,
  options?: ProgressToastOptions
) {
  const duration = options?.duration ?? (type === 'error' ? 6000 : 4000);

  return toast.custom(
    (id) => (
      <CustomToast
        id={id}
        type={type}
        message={message}
        description={description}
        duration={duration}
      />
    ),
    { duration }
  );
}

/**
 * Progress toast helpers - shows toast with animated progress bar
 *
 * @example
 * showProgressToast.success('Saved!', 'All changes have been synced.');
 * showProgressToast.error('Upload failed', 'File exceeds maximum size.');
 * showProgressToast.warning('Low storage', 'Only 10% remaining.');
 * showProgressToast.info('Tip', 'Press Ctrl+S to save quickly.');
 */
export const showProgressToast = {
  success: (message: string, description?: string, options?: ProgressToastOptions) =>
    showCustomToast('success', message, description, options),

  error: (message: string, description?: string, options?: ProgressToastOptions) =>
    showCustomToast('error', message, description, { duration: 6000, ...options }),

  warning: (message: string, description?: string, options?: ProgressToastOptions) =>
    showCustomToast('warning', message, description, options),

  info: (message: string, description?: string, options?: ProgressToastOptions) =>
    showCustomToast('info', message, description, options),
};

export default showProgressToast;
