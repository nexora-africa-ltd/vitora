import { HelpPopover } from './help-popover';

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional description shown below title */
  description?: string;
  /** Optional help content shown in popover */
  helpContent?: string;
  /** Optional action buttons */
  actions?: React.ReactNode;
}

/**
 * Consistent page header with title, optional description, help, and actions.
 * Responsive: stacks on mobile, horizontal on sm+ screens.
 */
export function PageHeader({ title, description, helpContent, actions }: PageHeaderProps) {
  const effectiveHelpContent = helpContent ?? description;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{title}</h1>
          {effectiveHelpContent && <HelpPopover content={effectiveHelpContent} />}
        </div>
      </div>
      {actions && (
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
