'use client';

import { usePermissions } from '@/lib/hooks/use-permissions';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { ActionKey } from '@/lib/permissions/actions';
import React from 'react';

interface ActionButtonProps extends ButtonProps {
  /** The action permission key to check (e.g. "inpatient.discharge") */
  action: ActionKey;
  /** Optional fallback rendered when the user lacks the action permission */
  fallback?: React.ReactNode;
}

/**
 * A Button that auto-hides (or shows a fallback) when the current user
 * lacks the specified action permission.
 *
 * @example
 * ```tsx
 * <ActionButton action="inpatient.discharge" onClick={handleDischarge}>
 *   Discharge Patient
 * </ActionButton>
 * ```
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ action, fallback, ...buttonProps }, ref) => {
    const { canPerformAction, isAuthenticated } = usePermissions();

    if (!isAuthenticated || !canPerformAction(action)) {
      if (fallback) return <>{fallback}</>;
      return null;
    }

    return <Button ref={ref} {...buttonProps} />;
  }
);
ActionButton.displayName = 'ActionButton';
