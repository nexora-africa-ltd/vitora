import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'warning' | 'success';
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend = 'neutral',
  variant = 'default',
}: StatsCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon
          className={cn(
            'h-4 w-4',
            variant === 'warning' && 'text-amber-500',
            variant === 'success' && 'text-green-500',
            variant === 'default' && 'text-muted-foreground'
          )}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <TrendIcon
              className={cn(
                'h-3 w-3',
                trend === 'up' && 'text-green-500',
                trend === 'down' && 'text-red-500'
              )}
            />
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
