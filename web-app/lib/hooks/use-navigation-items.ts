'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useAuth } from '@/lib/auth';
import { useFacility } from '@/lib/context/facility-context';
import { useNavigationMode } from '@/lib/context/navigation-mode-context';
import { useSubscription } from '@/lib/hooks/use-subscription';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { useInterfacilityTransfersEnabled } from '@/lib/hooks/use-interfacility-transfers-enabled';
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
import { isLISStandaloneRouteAllowed, isStandardRouteAllowed } from '@/lib/auth/route-access';
import { getAppConfig } from '@/lib/desktop';
import { getHubModuleCapability, loadHubRoutingManifest } from '@/lib/desktop/hub-capabilities';

export interface NavigationResult {
  items: NavItemType[];
  utilityItems: NavItemType[];
}

export function useNavigationItems(): NavigationResult {
  const { user } = useAuth();
  const { canAccessModule, canPerformAction, hasPermission, isSuperuser } = usePermissions();
  const { hasModule, facilityDetail, facility } = useFacility();
  const { navigationMode, isClinicalNavigationEligible } = useNavigationMode();
  const { hasFeature } = useSubscription();
  const { isSustainedOffline } = useNetworkStatus();
  const interfacilityTransfersEnabled = useInterfacilityTransfersEnabled();
  const [isHubMode, setIsHubMode] = useState(false);

  useEffect(() => {
    void getAppConfig().then((config) => {
      setIsHubMode(
        config?.deployment_mode === 'lan_client' || config?.deployment_mode === 'lan_hub'
      );
      if (config?.deployment_mode === 'lan_client' || config?.deployment_mode === 'lan_hub') {
        // Navigation remains available while discovery completes. The hub middleware
        // is authoritative and blocks restricted routes if the manifest is delayed.
        void loadHubRoutingManifest();
      }
    });
  }, []);
  const shouldFetchClinicTypes =
    canAccessModule('clinics') &&
    hasModule('outpatient') &&
    !isSustainedOffline &&
    (navigationMode === 'clinical' || isClinicalNavigationEligible);
  const { data: clinicsData } = useClinics(
    { page_size: 200, status: 'ACTIVE' },
    {
      enabled: shouldFetchClinicTypes,
      staleTime: 10 * 60 * 1000,
    }
  );

  // Derive the set of active clinic types from fetched clinics
  const activeClinicTypes = useMemo(() => {
    if (!clinicsData?.results) return undefined;
    return new Set(clinicsData.results.map((c) => c.clinic_type));
  }, [clinicsData]);

  return useMemo(() => {
    const isLISStandaloneProfile =
      facilityDetail?.operating_mode === 'STANDALONE_LAB' ||
      facility?.operating_mode === 'STANDALONE_LAB' ||
      facility?.deployment_profile === 'lis_standalone';

    const visibilityCtx: NavItemVisibilityContext = {
      facilityLevel: facilityDetail?.level,
      facilityOwnership: facilityDetail?.ownership,
      facilityCountryCode: facilityDetail?.country_code,
      activeClinicTypes,
      isSuperuser,
      shrEnabled: user?.facility?.shr_enabled,
    };

    const isAllowed = (item: {
      moduleKey?: string;
      facilityModule?: string;
      actionKey?: string;
      planFeature?: string;
      featureFlag?: string | boolean;
      requiresInternet?: boolean;
      visibleWhen?: (ctx: NavItemVisibilityContext) => boolean;
    }): boolean => {
      if (item.featureFlag === 'interfacility_transfers' && !interfacilityTransfersEnabled) {
        return false;
      }
      if (isHubMode && getHubModuleCapability(item.moduleKey) === 'UNAVAILABLE') return false;
      // Cloud-only workflows remain discoverable. Their route gate handles a
      // missing cloud session or unavailable cloud with a specific next step.
      if (isLISStandaloneProfile) {
        const href = 'href' in item && typeof item.href === 'string' ? item.href : '';
        if (href === '/patients/lookup' || href.startsWith('/patients/lookup/')) {
          return false;
        }
        if (href) {
          const allowed = isLISStandaloneProfile
            ? isLISStandaloneRouteAllowed(href, {
                canAccessModule,
                hasModule,
                canPerformAction,
              })
            : isStandardRouteAllowed(href, {
                canAccessModule,
                hasModule,
                canPerformAction,
                hasPermission,
              });
          if (!allowed) {
            return false;
          }
        }
      }
      if (item.moduleKey && !canAccessModule(item.moduleKey as never)) return false;
      if (item.facilityModule && !hasModule(item.facilityModule as never)) return false;
      if (item.actionKey && !canPerformAction(item.actionKey as never)) return false;
      if (item.planFeature && !hasFeature(item.planFeature)) return false;
      if (item.visibleWhen && !item.visibleWhen(visibilityCtx)) return false;
      // Hide internet-dependent items when sustained offline
      if (item.requiresInternet && isSustainedOffline) return false;
      return true;
    };

    const filterItem = (item: NavItemType): NavItemType | null => {
      if (!isAllowed(item)) return null;

      if (hasChildren(item)) {
        const filteredChildren = item.children.filter((child): child is NavItem =>
          isAllowed(child)
        );
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
    hasPermission,
    isSuperuser,
    hasModule,
    hasFeature,
    facilityDetail,
    activeClinicTypes,
    navigationMode,
    isClinicalNavigationEligible,
    isSustainedOffline,
    interfacilityTransfersEnabled,
    isHubMode,
    facility,
    user?.facility?.shr_enabled,
  ]);
}
