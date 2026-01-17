'use client'

import * as React from 'react'
import { toast, Toaster as SonnerToaster } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface CustomToastProps {
  id: string | number
  type: ToastType
  message: string
  description?: string
  duration?: number
}

const config: Record<
  ToastType,
  { icon: React.ElementType; progressColor: string; iconColor: string }
> = {
  success: { icon: CircleCheckIcon, progressColor: 'bg-green-500', iconColor: 'text-green-500' },
  error: { icon: OctagonXIcon, progressColor: 'bg-red-500', iconColor: 'text-red-500' },
  warning: { icon: TriangleAlertIcon, progressColor: 'bg-amber-500', iconColor: 'text-amber-500' },
  info: { icon: InfoIcon, progressColor: 'bg-blue-500', iconColor: 'text-blue-500' },
}

export function CustomToast({
  id,
  type,
  message,
  description,
  duration = 4000,
}: CustomToastProps) {
  const [progress, setProgress] = React.useState(100)
  const { icon: Icon, progressColor, iconColor } = config[type]

  React.useEffect(() => {
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
        'group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg',
        'border-l-4',
        type === 'success' && 'border-l-green-500',
        type === 'error' && 'border-l-red-500',
        type === 'warning' && 'border-l-amber-500',
        type === 'info' && 'border-l-blue-500'
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconColor)} />

      <div className="flex-1 space-y-1">
        <p className="text-base font-medium leading-tight">{message}</p>
        {description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{description}</p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => toast.dismiss(id)}
        className="size-6 shrink-0 opacity-70 hover:opacity-100"
      >
        <XIcon className="size-4" />
      </Button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted/50">
        <div
          className={cn('h-full transition-all ease-linear', progressColor)}
          style={{ width: `${progress}%`, transitionDuration: '16ms' }}
        />
      </div>
    </div>
  )
}

// -------------------- Combined Toaster --------------------

export function Toaster() {
  return (
    <>
      {/* Sonner handles stacking and dismiss */}
      <SonnerToaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          // Use custom class for base styling if needed
          classNames: {
            toast: 'bg-popover p-0 shadow-lg',
          },
        }}
       />
    </>
  )
}

// -------------------- Usage --------------------

// Trigger anywhere in your app:
toast.custom((id) => (
  <CustomToast
    id={id}
    type="success"
    message="Saved!"
    description="All changes have been synced."
  />
))
