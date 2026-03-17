// shadcn-ui popover
// Includes React 19 workaround for outside-click dismissal.
// Radix DismissableLayer (v1.1.11) uses onPointerDownCapture to track
// whether a click is inside the React tree, but React 19's changed portal
// event propagation causes the internal ref to get stuck — outside clicks
// are never detected. We add a native document listener as a fallback.
// TODO: Remove workaround once @radix-ui/react-dismissable-layer ships
// a stable React 19–compatible release.
"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils/index"

// Context to pass a close function from Popover root to PopoverContent
const PopoverCloseContext = React.createContext<(() => void) | null>(null)

function Popover({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    props.defaultOpen ?? false
  )
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const onOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(nextOpen)
      controlledOnOpenChange?.(nextOpen)
    },
    [isControlled, controlledOnOpenChange]
  )

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <PopoverCloseContext.Provider value={open ? close : null}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={open}
        onOpenChange={onOpenChange}
        {...props}
      />
    </PopoverCloseContext.Provider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const close = React.useContext(PopoverCloseContext)

  // React 19 workaround: native outside-click detection
  React.useEffect(() => {
    if (!close) return

    const onPointerDown = (e: PointerEvent) => {
      const content = contentRef.current
      if (!content) return
      const target = e.target as Node | null
      if (!target) return

      // Click is inside popover content — ignore
      if (content.contains(target)) return

      // Click is on the trigger — let Radix handle toggle
      const trigger = document.querySelector(
        '[data-slot="popover-trigger"][aria-expanded="true"]'
      )
      if (trigger?.contains(target)) return

      close()
    }

    // Delay by one frame so the listener doesn't catch the opening click
    const raf = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown, true)
    })

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [close])

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={contentRef}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
