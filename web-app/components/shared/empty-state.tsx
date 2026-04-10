import { LucideIcon, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VitoraLogo } from '@/components/ui/vitora-logo';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-12 text-center overflow-hidden">
      {/* Watermark logo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <VitoraLogo
          variant="icon"
          tone="teal"
          alt=""
          className="w-28 sm:w-32 opacity-[0.045] dark:opacity-[0.06]"
          imageClassName="pointer-events-none select-none"
        />
      </div>
      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
        )}
        {action && (
          <Button onClick={action.onClick} className="mt-4">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
