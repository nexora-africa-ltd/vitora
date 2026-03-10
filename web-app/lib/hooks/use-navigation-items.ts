'use client';

import { useMemo } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { useNavigationMode } from '@/lib/context/navigation-mode-context';
import {
  mainNavItems,
  hasChildren,
  type NavItem,
  type NavItemType,
} from '@/lib/config/navigation';
import {
  resolveClinicalSidebarItems,
} from '@/lib/config/clinical-navigation';

export function useNavigationItems(): NavItemType[] {
  const { canAccessModule, canPerformAction } = usePermissions();
  const { hasModule } = useFacility();
  const { navigationMode, isClinicalNavigationEligible } = useNavigationMode();

  return useMemo(() => {
    const isAllowed = (item: { moduleKey?: string; facilityModule?: string; actionKey?: string }): boolean => {
      if (item.moduleKey && !canAccessModule(item.moduleKey as never)) return false;
      if (item.facilityModule && !hasModule(item.facilityModule as never)) return false;
      if (item.actionKey && !canPerformAction(item.actionKey as never)) return false;
      return true;
    };

    const filterItem = (item: NavItemType): NavItemType | null => {
      if (!isAllowed(item)) return null;

      if (hasChildren(item)) {
        const filteredChildren = item.children.filter((child): child is NavItem => isAllowed(child));
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      }

      return item;
    };

    const standardItems = mainNavItems
      .map(filterItem)
      .filter((item): item is NavItemType => item !== null);

    const clinicalItems = resolveClinicalSidebarItems({
      canAccessModule,
      canPerformAction,
      hasModule,
    });

    if (
      navigationMode !== 'clinical' ||
      !isClinicalNavigationEligible ||
      clinicalItems.length === 0
    ) {
      return standardItems;
    }

    return clinicalItems;
  }, [
    canAccessModule,
    canPerformAction,
    hasModule,
    navigationMode,
    isClinicalNavigationEligible,
  ]);
}