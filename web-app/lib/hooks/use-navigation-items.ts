'use client';

import { useMemo } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import { useNavigationMode } from '@/lib/context/navigation-mode-context';
import { useSubscription } from '@/lib/hooks/use-subscription';
import {
  mainNavItems,
  hasChildren,
  type NavItem,
  type NavItemType,
  type NavItemVisibilityContext,
} from '@/lib/config/navigation';
import {
  resolveClinicalSidebarItems,
  resolveClinicalUtilityItems,
} from '@/lib/config/clinical-navigation';

export interface NavigationResult {
  items: NavItemType[];
  utilityItems: NavItemType[];
}

export function useNavigationItems(): NavigationResult {
  const { canAccessModule, canPerformAction } = usePermissions();
  const { hasModule, facilityDetail } = useFacility();
  const { navigationMode, isClinicalNavigationEligible } = useNavigationMode();
  const { hasFeature } = useSubscription();

  return useMemo(() => {
    const visibilityCtx: NavItemVisibilityContext = {
      facilityLevel: facilityDetail?.level,
      facilityOwnership: facilityDetail?.ownership,
    };

    const isAllowed = (item: { moduleKey?: string; facilityModule?: string; actionKey?: string; planFeature?: string; visibleWhen?: (ctx: NavItemVisibilityContext) => boolean }): boolean => {
      if (item.moduleKey && !canAccessModule(item.moduleKey as never)) return false;
      if (item.facilityModule && !hasModule(item.facilityModule as never)) return false;
      if (item.actionKey && !canPerformAction(item.actionKey as never)) return false;
      if (item.planFeature && !hasFeature(item.planFeature)) return false;
      if (item.visibleWhen && !item.visibleWhen(visibilityCtx)) return false;
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

    const ctx = { canAccessModule, canPerformAction, hasModule };
    const clinicalItems = resolveClinicalSidebarItems(ctx);
    const clinicalUtility = resolveClinicalUtilityItems(ctx);

    if (
      navigationMode !== 'clinical' ||
      !isClinicalNavigationEligible ||
      clinicalItems.length === 0
    ) {
      return { items: standardItems, utilityItems: [] };
    }

    return { items: clinicalItems, utilityItems: clinicalUtility };
  }, [
    canAccessModule,
    canPerformAction,
    hasModule,
    hasFeature,
    facilityDetail,
    navigationMode,
    isClinicalNavigationEligible,
  ]);
}
