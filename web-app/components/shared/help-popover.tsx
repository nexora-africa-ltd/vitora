import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface HelpPopoverProps {
  /** Help content to display */
  content: string;
  /** Size of the help icon */
  size?: 'sm' | 'md';
}

/**
 * Help popover with question mark icon.
 * Use to provide contextual help for page sections or form fields.
 */
export function HelpPopover({ content, size = 'sm' }: HelpPopoverProps) {
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 hover:bg-muted transition-colors"
          aria-label="Help"
        >
          <HelpCircle className={`${iconSize} text-muted-foreground cursor-help`} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="max-w-xs p-3">
        <p className="text-sm text-muted-foreground">{content}</p>
      </PopoverContent>
    </Popover>
  );
}
