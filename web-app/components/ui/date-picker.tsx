"use client";

import * as React from "react";
import { ChevronDownIcon, CalendarIcon, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
  /** Allow manual text input of dates (default: true) */
  allowInput?: boolean;
  /** Date format for display and input parsing (default: "dd/MM/yyyy") */
  inputFormat?: string;
}

/**
 * Parse a date string in multiple formats
 * Supports: dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd, d/M/yyyy
 */
function parseFlexibleDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try multiple formats
  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "MM/dd/yyyy",
    "M/d/yyyy",
    "yyyy-MM-dd",
    "dd-MM-yyyy",
    "d-M-yyyy",
  ];

  for (const fmt of formats) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2100) {
      return parsed;
    }
  }

  return null;
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
  allowInput = true,
  inputFormat = "dd/MM/yyyy",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [inputError, setInputError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync input value with external value changes
  React.useEffect(() => {
    if (value) {
      setInputValue(format(value, inputFormat));
      setInputError(false);
    } else {
      setInputValue("");
    }
  }, [value, inputFormat]);

  const defaultMonth = React.useMemo(() => {
    if (value) return value;
    // For future dates (like expiry), default to current month
    if (allowFuture) return new Date();
    // For past dates (like DOB), default to 30 years ago
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    return d;
  }, [value, allowFuture]);

  const isDateDisabled = React.useCallback((date: Date): boolean => {
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
  }, [minDate, maxDate, allowFuture, allowPast]);

  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Reset error state while typing
    setInputError(false);
  }, []);

  const handleInputBlur = React.useCallback(() => {
    if (!inputValue.trim()) {
      // Empty input - clear the date
      if (value) {
        onChange(undefined);
      }
      setInputError(false);
      return;
    }

    const parsed = parseFlexibleDate(inputValue);

    if (parsed) {
      // Check if the parsed date is within allowed range
      if (isDateDisabled(parsed)) {
        setInputError(true);
        // Revert to previous valid value
        if (value) {
          setInputValue(format(value, inputFormat));
        }
        return;
      }

      onChange(parsed);
      setInputValue(format(parsed, inputFormat));
      setInputError(false);
    } else {
      setInputError(true);
      // Revert to previous valid value after a brief delay
      if (value) {
        setInputValue(format(value, inputFormat));
      }
    }
  }, [inputValue, value, onChange, inputFormat, isDateDisabled]);

  const handleInputKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      // Revert to previous value
      if (value) {
        setInputValue(format(value, inputFormat));
      } else {
        setInputValue("");
      }
      setInputError(false);
      inputRef.current?.blur();
    }
  }, [handleInputBlur, value, inputFormat]);

  const handleClear = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setInputValue("");
    setInputError(false);
  }, [onChange]);

  const handleCalendarSelect = React.useCallback((date?: Date) => {
    onChange(date);
    setOpen(false);
    if (date) {
      setInputValue(format(date, inputFormat));
    } else {
      setInputValue("");
    }
    setInputError(false);
  }, [onChange, inputFormat]);

  // If input is not allowed, use the original button-only UI
  if (!allowInput) {
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
              error && "border-destructive focus-visible:ring-destructive",
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
            onSelect={handleCalendarSelect}
            disabled={isDateDisabled}
            fromYear={1900}
            toYear={allowFuture ? new Date().getFullYear() + 10 : new Date().getFullYear()}
            className="rounded-md"
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Enhanced UI with input field
  return (
    <div className={cn("relative", className)}>
      <div className="relative flex items-center">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          placeholder={placeholder || inputFormat.toLowerCase()}
          aria-invalid={error || inputError}
          className={cn(
            "h-10 pr-16",
            (error || inputError) && "border-destructive focus-visible:ring-destructive"
          )}
        />

        <div className="absolute right-1 flex items-center gap-0.5">
          {/* Clear button */}
          {value && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-muted"
              onClick={handleClear}
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="sr-only">Clear date</span>
            </Button>
          )}

          {/* Calendar trigger */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-7 w-7 p-0 hover:bg-muted"
                tabIndex={-1}
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Open calendar</span>
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              className="w-auto rounded-md border p-2 shadow-md"
            >
              <Calendar
                mode="single"
                selected={value}
                captionLayout="dropdown"
                defaultMonth={defaultMonth}
                onSelect={handleCalendarSelect}
                disabled={isDateDisabled}
                fromYear={1900}
                toYear={allowFuture ? new Date().getFullYear() + 10 : new Date().getFullYear()}
                className="rounded-md"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Format hint */}
      {inputError && (
        <p className="mt-1 text-xs text-destructive">
          Invalid date. Use format: {inputFormat.toLowerCase()}
        </p>
      )}
    </div>
  );
}

export default DatePicker;
