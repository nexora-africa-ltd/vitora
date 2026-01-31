"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/index";

type MultiSelectData = {
  label: string;
  value: string;
};

type MultiSelectContextType = {
  data: MultiSelectData[];
  type: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
};

const MultiSelectContext = createContext<MultiSelectContextType>({
  data: [],
  type: "item",
  values: [],
  onValuesChange: () => {},
  open: false,
  onOpenChange: () => {},
  width: 200,
  setWidth: () => {},
  inputValue: "",
  setInputValue: () => {},
});

export type MultiSelectProps = ComponentProps<typeof Popover> & {
  data: MultiSelectData[];
  type: string;
  defaultValues?: string[];
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const MultiSelect = ({
  data,
  type,
  defaultValues,
  values: controlledValues,
  onValuesChange: controlledOnValuesChange,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: MultiSelectProps) => {
  const [values, onValuesChange] = useControllableState({
    defaultProp: defaultValues ?? [],
    prop: controlledValues,
    onChange: controlledOnValuesChange,
  });
  const [open, onOpenChange] = useControllableState({
    defaultProp: defaultOpen,
    prop: controlledOpen,
    onChange: controlledOnOpenChange,
  });
  const [width, setWidth] = useState(200);
  const [inputValue, setInputValue] = useState("");

  return (
    <MultiSelectContext.Provider
      value={{
        type,
        values,
        onValuesChange,
        open,
        onOpenChange,
        data,
        width,
        setWidth,
        inputValue,
        setInputValue,
      }}
    >
      <Popover {...props} onOpenChange={onOpenChange} open={open} />
    </MultiSelectContext.Provider>
  );
};

export type MultiSelectTriggerProps = ComponentProps<typeof Button> & {
  placeholder?: string;
  maxDisplayItems?: number;
};

export const MultiSelectTrigger = ({
  children,
  placeholder,
  maxDisplayItems = 2,
  className,
  ...props
}: MultiSelectTriggerProps) => {
  const { values, data, type, setWidth } = useContext(MultiSelectContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = (entry.target as HTMLElement).offsetWidth;
        if (newWidth) {
          setWidth?.(newWidth);
        }
      }
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [setWidth]);

  const selectedLabels = values
    .map((v) => data.find((item) => item.value === v)?.label)
    .filter(Boolean);

  return (
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        className={cn("justify-between", className)}
        {...props}
        ref={ref}
      >
        {children ?? (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">
              {values.length === 0
                ? placeholder ?? `Select ${type}...`
                : selectedLabels.length <= maxDisplayItems
                  ? selectedLabels.join(", ")
                  : `${selectedLabels.slice(0, maxDisplayItems).join(", ")} +${values.length - maxDisplayItems}`}
            </span>
            <ChevronsUpDownIcon
              className="shrink-0 text-muted-foreground"
              size={16}
            />
          </span>
        )}
      </Button>
    </PopoverTrigger>
  );
};

export type MultiSelectContentProps = ComponentProps<typeof Command> & {
  popoverOptions?: ComponentProps<typeof PopoverContent>;
};

export const MultiSelectContent = ({
  className,
  popoverOptions,
  ...props
}: MultiSelectContentProps) => {
  const { width } = useContext(MultiSelectContext);

  return (
    <PopoverContent
      className={cn("p-0", className)}
      style={{ width }}
      {...popoverOptions}
    >
      <Command {...props} />
    </PopoverContent>
  );
};

export type MultiSelectInputProps = ComponentProps<typeof CommandInput> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

export const MultiSelectInput = ({
  value: controlledValue,
  defaultValue,
  onValueChange: controlledOnValueChange,
  ...props
}: MultiSelectInputProps) => {
  const { type, inputValue, setInputValue } = useContext(MultiSelectContext);

  const [value, onValueChange] = useControllableState({
    defaultProp: defaultValue ?? inputValue,
    prop: controlledValue,
    onChange: (newValue) => {
      setInputValue(newValue);
      controlledOnValueChange?.(newValue);
    },
  });

  return (
    <CommandInput
      onValueChange={onValueChange}
      placeholder={`Search ${type}...`}
      value={value}
      {...props}
    />
  );
};

export type MultiSelectListProps = ComponentProps<typeof CommandList>;

export const MultiSelectList = (props: MultiSelectListProps) => (
  <CommandList {...props} />
);

export type MultiSelectEmptyProps = ComponentProps<typeof CommandEmpty>;

export const MultiSelectEmpty = ({
  children,
  ...props
}: MultiSelectEmptyProps) => {
  const { type } = useContext(MultiSelectContext);

  return (
    <CommandEmpty {...props}>{children ?? `No ${type} found.`}</CommandEmpty>
  );
};

export type MultiSelectGroupProps = ComponentProps<typeof CommandGroup>;

export const MultiSelectGroup = (props: MultiSelectGroupProps) => (
  <CommandGroup {...props} />
);

export type MultiSelectItemProps = ComponentProps<typeof CommandItem> & {
  value: string;
};

export const MultiSelectItem = ({
  value,
  children,
  className,
  ...props
}: MultiSelectItemProps) => {
  const { values, onValuesChange } = useContext(MultiSelectContext);
  const isSelected = values.includes(value);

  return (
    <CommandItem
      onSelect={() => {
        if (isSelected) {
          onValuesChange(values.filter((v) => v !== value));
        } else {
          onValuesChange([...values, value]);
        }
      }}
      className={cn("cursor-pointer", className)}
      {...props}
    >
      <span className="flex items-center gap-2 w-full">
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "opacity-50 [&_svg]:invisible"
          )}
        >
          <CheckIcon className="h-3 w-3" />
        </span>
        <span className="flex-1">{children}</span>
      </span>
    </CommandItem>
  );
};

export type MultiSelectSeparatorProps = ComponentProps<typeof CommandSeparator>;

export const MultiSelectSeparator = (props: MultiSelectSeparatorProps) => (
  <CommandSeparator {...props} />
);

/**
 * Display selected items as badges below the trigger
 */
export type MultiSelectBadgesProps = {
  className?: string;
  badgeClassName?: string;
  onRemove?: (value: string) => void;
};

export const MultiSelectBadges = ({
  className,
  badgeClassName,
  onRemove,
}: MultiSelectBadgesProps) => {
  const { values, data, onValuesChange } = useContext(MultiSelectContext);

  if (values.length === 0) {
    return null;
  }

  const handleRemove = (value: string) => {
    onValuesChange(values.filter((v) => v !== value));
    onRemove?.(value);
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5 mt-2", className)}>
      {values.map((value) => {
        const item = data.find((d) => d.value === value);
        return (
          <Badge
            key={value}
            variant="secondary"
            className={cn("gap-1 pr-1", badgeClassName)}
          >
            {item?.label ?? value}
            <button
              type="button"
              onClick={() => handleRemove(value)}
              className="ml-0.5 rounded-full hover:bg-secondary-foreground/20 p-0.5"
              aria-label={`Remove ${item?.label ?? value}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
};

/**
 * Clear all selected values
 */
export type MultiSelectClearProps = {
  children?: React.ReactNode;
  className?: string;
};

export const MultiSelectClear = ({
  children,
  className,
}: MultiSelectClearProps) => {
  const { values, onValuesChange } = useContext(MultiSelectContext);

  if (values.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onValuesChange([])}
      className={cn(
        "text-xs text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
    >
      {children ?? "Clear all"}
    </button>
  );
};
