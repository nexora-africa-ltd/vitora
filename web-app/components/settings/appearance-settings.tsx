'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useNavigationMode, type NavigationMode } from '@/lib/context/navigation-mode-context';

const NAVIGATION_MODE_OPTIONS: Array<{
  value: NavigationMode;
  title: string;
  description: string;
}> = [
  {
    value: 'standard',
    title: 'Standard Mode',
    description: 'Organized by modules and departments, matching the existing sidebar structure.',
  },
  {
    value: 'clinical',
    title: 'Clinical Mode',
    description: 'Highlights patient workflow queues and worklists for clinical staff.',
  },
];

export function AppearanceSettings() {
  const { navigationMode, setNavigationMode, isClinicalNavigationEligible } = useNavigationMode();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg">Navigation Mode</CardTitle>
          <HelpPopover content="Choose between the current module-based sidebar and a workflow-oriented clinical view. This setting does not change permissions." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Switch between the current module navigation and a workflow-first clinical landing experience.
        </p>

        {isClinicalNavigationEligible ? (
          <RadioGroup
            value={navigationMode}
            onValueChange={(value) => setNavigationMode(value as NavigationMode)}
            className="gap-3"
          >
            {NAVIGATION_MODE_OPTIONS.map((option) => {
              const optionId = `navigation-mode-${option.value}`;
              const isSelected = navigationMode === option.value;

              return (
                <div
                  key={option.value}
                  className="rounded-lg border border-border/70 bg-card/60 p-4 transition-colors hover:border-cyan-400/40"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={option.value} id={optionId} className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={optionId} className="cursor-pointer font-medium text-foreground">
                          {option.title}
                        </Label>
                        {isSelected ? <Badge variant="secondary">Active</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Clinical Mode rollout is limited.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clinical Mode is currently available to clinical roles and selected front-desk workflows. Your current role will keep the standard navigation for now.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
