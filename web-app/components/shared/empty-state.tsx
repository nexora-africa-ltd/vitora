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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-sm">
        <VitoraLogo
          variant="icon"
          tone="teal"
          alt=""
          className="w-9 opacity-80"
          imageClassName="pointer-events-none select-none"
        />
      </div>
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
  );
}
