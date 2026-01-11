"use client"

import * as React from "react"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DobPickerProps {
  /** Selected date value */
  value?: Date
  /** Callback when date changes */
  onChange: (date?: Date) => void
  /** Disable the picker */
  disabled?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Custom class name for the trigger button */
  className?: string
  /** Error state */
  error?: boolean
}

/**
 * Date of Birth Picker Component
 * 
 * A specialized date picker optimized for selecting dates of birth:
 * - Dropdown navigation for easy year/month selection (100+ years back)
 * - Prevents future dates
 * - Controlled open state for better UX
 */
export function DobPicker({ 
  value, 
  onChange, 
  disabled,
  placeholder = "Select date of birth",
  className,
  error,
}: DobPickerProps) {
  const [open, setOpen] = React.useState(false)

  // Calculate a reasonable default month (30 years ago if no value)
  const defaultMonth = React.useMemo(() => {
    if (value) return value
    const thirtyYearsAgo = new Date()
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30)
    return thirtyYearsAgo
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            error && "border-destructive",
            className
          )}
        >
          {value ? format(value, "PPP") : placeholder}
          <ChevronDownIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
          disabled={(date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          defaultMonth={defaultMonth}
          fromYear={1900}
          toYear={new Date().getFullYear()}
        />
      </PopoverContent>
    </Popover>
  )
}

export default DobPicker
