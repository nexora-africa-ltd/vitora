"use client";

import * as React from "react";
import { LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Size mappings for the spinner
const sizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
} as const;

interface LoadingSpinnerProps extends React.ComponentProps<"svg"> {
  size?: keyof typeof sizeClasses;
}

/**
 * Simple loading spinner component using Lucide LoaderIcon.
 * Use for inline loading states.
 */
export function LoadingSpinner({
  className,
  size = "md",
  ...props
}: LoadingSpinnerProps) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-primary", sizeClasses[size], className)}
      {...props}
    />
  );
}

interface PageLoadingProps {
  message?: string;
  fullScreen?: boolean;
}

/**
 * Full page loading component with message.
 * Used by Next.js loading.tsx for route transitions.
 */
export function PageLoading({
  message = "Loading...",
  fullScreen = true
}: PageLoadingProps) {
  return (
    <div className={cn(
      "flex min-h-screen w-full items-center justify-center gap-3 p-8",
      !fullScreen && "min-h-0"
    )}>
      <LoadingSpinner size="md" />
      <span className="text-muted-foreground">{message}</span>
    </div>
  );
}
