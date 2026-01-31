"use client";

import * as React from "react";
import { ChevronDownIcon, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  onChange: (date?: Date) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: boolean;
  /** Allow selecting dates in the future (default: false for backward compatibility) */
  allowFuture?: boolean;
  /** Allow selecting dates in the past (default: true) */
  allowPast?: boolean;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Select",
  className,
  error,
  allowFuture = false,
  allowPast = true,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const defaultMonth = React.useMemo(() => {
    if (value) return value;
    // For future dates (like expiry), default to current month
    if (allowFuture) return new Date();
    // For past dates (like DOB), default to 30 years ago
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    return d;
  }, [value, allowFuture]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={error}
          className={cn(
            "h-10 w-full justify-between px-3 text-left font-normal",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !value && "text-muted-foreground",
            error &&
              "border-destructive focus-visible:ring-destructive",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            {value ? format(value, "PPP") : placeholder}
          </span>

          <ChevronDownIcon
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto rounded-md border p-2 shadow-md"
      >
        <Calendar
          mode="single"
          selected={value}
          captionLayout="dropdown"
          defaultMonth={defaultMonth}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          disabled={(date) => {
            // Check explicit min/max dates first
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            // Check past/future restrictions
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!allowFuture && date > today) return true;
            if (!allowPast && date < today) return true;
            // Always enforce reasonable bounds
            if (date < new Date("1900-01-01")) return true;
            return false;
          }}
          fromYear={1900}
          toYear={allowFuture ? new Date().getFullYear() + 10 : new Date().getFullYear()}
          className="rounded-md"
        />
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
