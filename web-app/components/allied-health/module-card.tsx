/**
 * Allied Health Module Card
 * Dashboard card for each Allied Health module
 */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleCardProps {
  title: string;
  href: string;
  icon: LucideIcon;
  stats: {
    label: string;
    value: number;
    variant?: 'default' | 'warning' | 'danger';
  }[];
  className?: string;
}

export function ModuleCard({ title, href, icon: Icon, stats, className }: ModuleCardProps) {
  const variantClasses = {
    default: 'bg-muted text-muted-foreground',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
  };

  return (
    <Link href={href}>
      <Card
        className={cn(
          'hover:bg-muted/50 transition-colors cursor-pointer h-full',
          className
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stats.map((stat) => (
              <Badge
                key={stat.label}
                variant="secondary"
                className={cn('text-xs', variantClasses[stat.variant || 'default'])}
              >
                {stat.value} {stat.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
