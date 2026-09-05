/**
 * Select component for dropdown selections.
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { ChevronDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

interface SelectContextValue {
  value: string;
  displayText: string;
  onValueChange: (value: string, displayText?: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  registerItem: (itemValue: string, displayText: string) => void;
  itemRegistry: Map<string, string>;
  listboxId: string;
}

const SelectContext = React.createContext<SelectContextValue | undefined>(undefined);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({
  value,
  defaultValue = '',
  onValueChange,
  children,
  disabled,
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [displayText, setDisplayText] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [registryVersion, setRegistryVersion] = React.useState(0);
  const itemRegistryRef = React.useRef<Map<string, string>>(new Map());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  const handleValueChange = React.useCallback(
    (newValue: string, newDisplayText?: string) => {
      if (disabled) return;
      setInternalValue(newValue);
      if (newDisplayText) setDisplayText(newDisplayText);
      onValueChange?.(newValue);
      setOpen(false);
    },
    [onValueChange, disabled]
  );

  const registerItem = React.useCallback((itemValue: string, itemDisplayText: string) => {
    const existing = itemRegistryRef.current.get(itemValue);
    if (existing !== itemDisplayText) {
      itemRegistryRef.current.set(itemValue, itemDisplayText);
      // Trigger re-render to update displayText lookup
      setRegistryVersion((v) => v + 1);
    }
  }, []);

  const currentValue = value !== undefined ? value : internalValue;

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const raf = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  // Sync displayText when controlled value changes or registry updates
  React.useEffect(() => {
    if (currentValue && itemRegistryRef.current.has(currentValue)) {
      const registeredText = itemRegistryRef.current.get(currentValue);
      if (registeredText && registeredText !== displayText) {
        setDisplayText(registeredText);
      }
    }
  }, [currentValue, displayText, registryVersion]);

  const extractText = React.useCallback((node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (React.isValidElement(node) && node.props.children) {
      return extractText(node.props.children);
    }
    return '';
  }, []);

  const collectedItems = React.useMemo(() => {
    const items: Array<{ value: string; text: string }> = [];
    const walk = (node: React.ReactNode) => {
      if (!React.isValidElement(node)) return;
      const nodeType = node.type as { displayName?: string };
      if (nodeType?.displayName === 'SelectItem' && typeof node.props.value === 'string') {
        items.push({
          value: node.props.value,
          text: node.props.textValue || extractText(node.props.children),
        });
      }
      if (node.props?.children) {
        React.Children.forEach(node.props.children, walk);
      }
    };
    React.Children.forEach(children, walk);
    return items;
  }, [children, extractText]);

  React.useEffect(() => {
    collectedItems.forEach(({ value: itemValue, text }) => {
      const existing = itemRegistryRef.current.get(itemValue);
      if (existing !== text) {
        itemRegistryRef.current.set(itemValue, text);
        setRegistryVersion((v) => v + 1);
      }
    });
  }, [collectedItems]);

  return (
    <SelectContext.Provider
      value={{
        value: currentValue,
        displayText,
        onValueChange: handleValueChange,
        open,
        setOpen,
        registerItem,
        itemRegistry: itemRegistryRef.current,
        listboxId,
      }}
    >
      <div ref={containerRef} className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectTrigger must be used within Select');

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={context.open ? 'true' : 'false'}
      aria-haspopup="listbox"
      aria-controls={context.listboxId}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'w-full justify-between font-normal dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:border-teal-600/70 dark:hover:bg-teal-400/10 dark:focus-visible:ring-teal-300/70',
        className
      )}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

const SelectValue: React.FC<SelectValueProps> = ({ placeholder, children }) => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error('SelectValue must be used within Select');

  // If children provided (render prop pattern), use that
  // Otherwise use displayText from state or registry lookup
  // This handles both user-selected values and programmatically set values
  const registryText = context.value ? context.itemRegistry.get(context.value) : undefined;
  const resolvedDisplayText = context.displayText || registryText;
  const displayContent = children || resolvedDisplayText || placeholder;

  const hasValue = !!context.value;
  const hasDisplayText = !!resolvedDisplayText;

  return (
    <span className={!hasValue ? 'text-muted-foreground' : ''}>
      {hasValue && hasDisplayText ? displayContent : hasValue ? displayContent : placeholder}
    </span>
  );
};

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error('SelectContent must be used within Select');

    return (
      <div
        ref={ref}
        role="listbox"
        id={context.listboxId}
        hidden={!context.open}
        className={cn(
          'absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100',
          !context.open && 'hidden',
          className
        )}
        {...props}
      >
        <div className="p-1">{context.open ? children : null}</div>
      </div>
    );
  }
);
SelectContent.displayName = 'SelectContent';

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  /** Explicit display text for the trigger. If omitted, extracted from children. */
  textValue?: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, textValue, children, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error('SelectItem must be used within Select');

    const isSelected = context.value === value;

    // Extract text content from children for display
    const getTextContent = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (typeof node === 'number') return String(node);
      if (Array.isArray(node)) return node.map(getTextContent).join('');
      if (React.isValidElement(node) && node.props.children) {
        return getTextContent(node.props.children);
      }
      return '';
    };

    const textContent = textValue || getTextContent(children);

    // Register this item's value -> displayText mapping on mount
    React.useEffect(() => {
      context.registerItem(value, textContent);
    }, [value, textContent, context]);

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected ? 'true' : 'false'}
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground dark:hover:bg-teal-400/15 dark:hover:text-teal-100 dark:focus:bg-teal-400/15 dark:focus:text-teal-100',
          isSelected && 'bg-accent text-accent-foreground dark:bg-teal-400/20 dark:text-teal-100',
          className
        )}
        onClick={() => context.onValueChange(value, textContent)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = 'SelectItem';
SelectItem.displayName = 'SelectItem';

interface SelectGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const SelectGroup = React.forwardRef<HTMLDivElement, SelectGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('py-1', className)} {...props}>
        {children}
      </div>
    );
  }
);
SelectGroup.displayName = 'SelectGroup';

interface SelectLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const SelectLabel = React.forwardRef<HTMLDivElement, SelectLabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'px-2 py-1.5 text-xs font-semibold text-muted-foreground dark:text-slate-400',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectLabel.displayName = 'SelectLabel';

const SelectSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('-mx-1 my-1 h-px bg-muted dark:bg-slate-700', className)} {...props} />
  )
);
SelectSeparator.displayName = 'SelectSeparator';

interface SelectEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

const SelectEmpty = React.forwardRef<HTMLDivElement, SelectEmptyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center justify-center px-2 py-6 text-center', className)}
        {...props}
      >
        <span className="text-sm text-muted-foreground">{children || 'No options available'}</span>
      </div>
    );
  }
);
SelectEmpty.displayName = 'SelectEmpty';

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectEmpty,
};
