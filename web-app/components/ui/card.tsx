import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/index"

const cardVariants = cva(
  "rounded-xl border bg-card text-card-foreground shadow transition-all duration-200",
  {
    variants: {
      variant: {
        default: "hover:shadow-md",
        interactive:
          "cursor-pointer hover:shadow-lg hover:scale-[1.02] hover:border-primary/30 active:scale-[0.98]",
        elevated:
          "shadow-md hover:shadow-xl hover:translate-y-[-2px]",
        outline:
          "border-2 hover:border-primary/50 hover:shadow-sm",
        ghost:
          "border-transparent shadow-none hover:bg-muted/50",
        accent:
          "border-accent/20 bg-gradient-to-br from-card to-accent/5 hover:border-accent/40 hover:shadow-md",
        primary:
          "border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:border-primary/40 hover:shadow-md",
        secondary:
          "border-secondary/20 bg-gradient-to-br from-card to-secondary/5 hover:border-secondary/40 hover:shadow-md",
        success:
          "border-success/20 bg-gradient-to-br from-card to-success/5 hover:border-success/40 hover:shadow-md",
        warning:
          "border-warning/20 bg-gradient-to-br from-card to-warning/5 hover:border-warning/40 hover:shadow-md",
        critical:
          "border-critical/20 bg-gradient-to-br from-card to-critical/5 hover:border-critical/40 hover:shadow-md",
      },
      size: {
        default: "",
        sm: "p-2",
        lg: "p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Make card clickable with proper focus states */
  asButton?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, asButton, onClick, ...props }, ref) => {
    // Use interactive variant automatically when onClick is provided
    const effectiveVariant = onClick && !variant ? "interactive" : variant
    
    return (
      <div
        ref={ref}
        role={asButton || onClick ? "button" : undefined}
        tabIndex={asButton || onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          asButton || onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
                }
              }
            : undefined
        }
        className={cn(
          cardVariants({ variant: effectiveVariant, size }),
          (asButton || onClick) &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
