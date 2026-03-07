import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminStatCardProps {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  valueClassName?: string;
}

export function AdminStatCard({
  title,
  value,
  description,
  icon,
  valueClassName,
}: AdminStatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={valueClassName ?? 'text-2xl font-semibold'}>{value}</div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}