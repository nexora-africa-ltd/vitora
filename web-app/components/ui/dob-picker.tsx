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

interface DobPickerProps {
  value?: Date;
  onChange: (date?: Date) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: boolean;
}

export function DobPicker({
  value,
  onChange,
  disabled,
  placeholder = "Select",
  className,
  error,
}: DobPickerProps) {
  const [open, setOpen] = React.useState(false);

  const defaultMonth = React.useMemo(() => {
    if (value) return value;
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    return d;
  }, [value]);

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
          disabled={(date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          fromYear={1900}
          toYear={new Date().getFullYear()}
          className="rounded-md"
        />
      </PopoverContent>
    </Popover>
  );
}

export default DobPicker;
