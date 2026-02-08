/**
 * Select component for dropdown selections.
 */

import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { ChevronDown } from "lucide-react"

interface SelectContextValue {
  value: string
  displayText: string
  onValueChange: (value: string, displayText?: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  registerItem: (itemValue: string, displayText: string) => void
  itemRegistry: Map<string, string>
  listboxId: string
}

const SelectContext = React.createContext<SelectContextValue | undefined>(undefined)

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
}

const Select: React.FC<SelectProps> = ({ value, defaultValue = '', onValueChange, children, disabled }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [displayText, setDisplayText] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [registryVersion, setRegistryVersion] = React.useState(0)
  const itemRegistryRef = React.useRef<Map<string, string>>(new Map())
  const listboxId = React.useId()

  const handleValueChange = React.useCallback((newValue: string, newDisplayText?: string) => {
    if (disabled) return
    setInternalValue(newValue)
    if (newDisplayText) setDisplayText(newDisplayText)
    onValueChange?.(newValue)
    setOpen(false)
  }, [onValueChange, disabled])

  const registerItem = React.useCallback((itemValue: string, itemDisplayText: string) => {
    const existing = itemRegistryRef.current.get(itemValue)
    if (existing !== itemDisplayText) {
      itemRegistryRef.current.set(itemValue, itemDisplayText)
      // Trigger re-render to update displayText lookup
      setRegistryVersion((v) => v + 1)
    }
  }, [])

  const currentValue = value !== undefined ? value : internalValue

  // Sync displayText when controlled value changes or registry updates
  React.useEffect(() => {
    if (currentValue && itemRegistryRef.current.has(currentValue)) {
      const registeredText = itemRegistryRef.current.get(currentValue)
      if (registeredText && registeredText !== displayText) {
        setDisplayText(registeredText)
      }
    }
  }, [currentValue, displayText, registryVersion])

  const extractText = React.useCallback((node: React.ReactNode): string => {
    if (typeof node === 'string') return node
    if (typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(extractText).join('')
    if (React.isValidElement(node) && node.props.children) {
      return extractText(node.props.children)
    }
    return ''
  }, [])

  const collectedItems = React.useMemo(() => {
    const items: Array<{ value: string; text: string }> = []
    const walk = (node: React.ReactNode) => {
      if (!React.isValidElement(node)) return
      const nodeType = node.type as { displayName?: string }
      if (nodeType?.displayName === 'SelectItem' && typeof node.props.value === 'string') {
        items.push({
          value: node.props.value,
          text: extractText(node.props.children),
        })
      }
      if (node.props?.children) {
        React.Children.forEach(node.props.children, walk)
      }
    }
    React.Children.forEach(children, walk)
    return items
  }, [children, extractText])

  React.useEffect(() => {
    collectedItems.forEach(({ value: itemValue, text }) => {
      const existing = itemRegistryRef.current.get(itemValue)
      if (existing !== text) {
        itemRegistryRef.current.set(itemValue, text)
        setRegistryVersion((v) => v + 1)
      }
    })
  }, [collectedItems])

  return (
    <SelectContext.Provider value={{ value: currentValue, displayText, onValueChange: handleValueChange, open, setOpen, registerItem, itemRegistry: itemRegistryRef.current, listboxId }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectTrigger must be used within Select')

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={context.open ? "true" : "false"}
      aria-haspopup="listbox"
      aria-controls={context.listboxId}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 animate-pulse hover:bg-teal-400/10 hover:text-foreground hover:shadow-sm",
        className
      )}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

interface SelectValueProps {
  placeholder?: string
  children?: React.ReactNode
}

const SelectValue: React.FC<SelectValueProps> = ({ placeholder, children }) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectValue must be used within Select')

  // If children provided (render prop pattern), use that
  // Otherwise use displayText from state or registry lookup
  // This handles both user-selected values and programmatically set values
  const registryText = context.value ? context.itemRegistry.get(context.value) : undefined
  const resolvedDisplayText = context.displayText || registryText
  const displayContent = children || resolvedDisplayText || placeholder

  const hasValue = !!context.value
  const hasDisplayText = !!resolvedDisplayText

  return (
    <span className={!hasValue ? 'text-muted-foreground' : ''}>
      {hasValue && hasDisplayText ? displayContent : (hasValue ? displayContent : placeholder)}
    </span>
  )
}

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')

  return (
    <div
      ref={ref}
      role="listbox"
      id={context.listboxId}
      hidden={!context.open}
      className={cn(
        "absolute top-full left-0 z-50 mt-1 w-full min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        !context.open && "hidden",
        className
      )}
      {...props}
    >
      <div className="p-1">
        {context.open ? children : null}
      </div>
    </div>
  )
})
SelectContent.displayName = "SelectContent"

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const context = React.useContext(SelectContext)
    if (!context) throw new Error('SelectItem must be used within Select')

    const isSelected = context.value === value

    // Extract text content from children for display
    const getTextContent = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (Array.isArray(node)) return node.map(getTextContent).join('')
      if (React.isValidElement(node) && node.props.children) {
        return getTextContent(node.props.children)
      }
      return ''
    }

    const textContent = getTextContent(children)

    // Register this item's value -> displayText mapping on mount
    React.useEffect(() => {
      context.registerItem(value, textContent)
    }, [value, textContent, context])

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected ? "true" : "false"}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          isSelected && "bg-accent text-accent-foreground",
          className
        )}
        onClick={() => context.onValueChange(value, textContent)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectItem.displayName = "SelectItem"
SelectItem.displayName = "SelectItem"

interface SelectGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const SelectGroup = React.forwardRef<HTMLDivElement, SelectGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("py-1", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectGroup.displayName = "SelectGroup"

interface SelectLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const SelectLabel = React.forwardRef<HTMLDivElement, SelectLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "px-2 py-1.5 text-xs font-semibold text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectLabel.displayName = "SelectLabel"

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"

interface SelectEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

const SelectEmpty = React.forwardRef<HTMLDivElement, SelectEmptyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-6 px-2 text-center",
          className
        )}
        {...props}
      >
        <span className="text-sm text-muted-foreground">
          {children || "No options available"}
        </span>
      </div>
    )
  }
)
SelectEmpty.displayName = "SelectEmpty"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator, SelectEmpty }
