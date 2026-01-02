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

  const handleValueChange = React.useCallback((newValue: string, newDisplayText?: string) => {
    if (disabled) return
    setInternalValue(newValue)
    if (newDisplayText) setDisplayText(newDisplayText)
    onValueChange?.(newValue)
    setOpen(false)
  }, [onValueChange, disabled])

  const currentValue = value !== undefined ? value : internalValue

  return (
    <SelectContext.Provider value={{ value: currentValue, displayText, onValueChange: handleValueChange, open, setOpen }}>
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
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
  // Otherwise use displayText if available, then fall back to value
  const displayContent = children || context.displayText || (context.value ? context.value : placeholder)
  
  return (
    <span className={!context.value && !context.displayText ? 'text-muted-foreground' : ''}>
      {context.value ? displayContent : placeholder}
    </span>
  )
}

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')

  if (!context.open) return null

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-full left-0 z-50 mt-1 w-full min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    >
      <div className="p-1">
        {children}
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

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          isSelected && "bg-accent text-accent-foreground",
          className
        )}
        onClick={() => context.onValueChange(value, getTextContent(children))}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
