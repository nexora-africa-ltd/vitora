"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      visibleToasts={4}
      gap={8}
      expand={true}
      hotkey={['Escape']}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "group toast !shadow-lg",
          title: "!font-medium",
          description: "!text-current !opacity-80",
          success: "!border-l-4 !border-l-green-500 !bg-green-500/10 [&_svg]:!text-green-500",
          error: "!border-l-4 !border-l-red-500 !bg-red-500/10 [&_svg]:!text-red-500",
          warning: "!border-l-4 !border-l-amber-500 !bg-amber-500/10 [&_svg]:!text-amber-500",
          info: "!border-l-4 !border-l-blue-500 !bg-blue-500/10 [&_svg]:!text-blue-500",
          actionButton: "!bg-primary !text-primary-foreground hover:!bg-primary/90 !font-medium",
          cancelButton: "!bg-muted !text-muted-foreground hover:!bg-muted/80",
          closeButton: "!bg-background !border-border hover:!bg-muted",
        },
      }}
      {...props}
    />
  )
}

// Re-export custom toast with progress bar for convenience
export { CustomToast, showProgressToast } from './custom-toast';

export { Toaster }
