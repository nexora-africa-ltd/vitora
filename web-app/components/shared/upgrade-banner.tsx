/**
 * UpgradeBanner — Shown when a feature requires a plan upgrade.
 */
'use client';

import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/lib/hooks/use-subscription';

interface UpgradeBannerProps {
  /** Feature name for the message (e.g. "AI Assistant", "Laboratory") */
  feature: string;
  /** Optional compact mode for inline use */
  compact?: boolean;
}

export function UpgradeBanner({ feature, compact = false }: UpgradeBannerProps) {
  const { tier } = useSubscription();

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>{feature} requires a plan upgrade</span>
        <Badge variant="outline" className="text-[10px] px-1">
          {tier}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{feature} is not available on your plan</p>
        <p className="text-xs text-muted-foreground">
          Upgrade your subscription to unlock {feature.toLowerCase()}.
          Contact your administrator for plan changes.
        </p>
      </div>
      <Badge variant="secondary" className="text-xs">
        Current plan: {tier}
      </Badge>
    </div>
  );
}
