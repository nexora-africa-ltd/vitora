import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  // Sidebar state
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Notifications
  unreadNotifications: number;

  // Global loading
  isGlobalLoading: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setUnreadNotifications: (count: number) => void;
  setGlobalLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: 'system',
      unreadNotifications: 0,
      isGlobalLoading: false,

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      setUnreadNotifications: (count) => set({ unreadNotifications: count }),
      setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),
    }),
    {
      name: 'vitora-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);

export interface DesktopWorkspaceTab {
  route: string;
  title: string;
  subtitle?: string;
  openedAt: string;
  updatedAt: string;
}

interface UpsertDesktopTabInput {
  title: string;
  subtitle?: string;
  route: string;
}

interface DesktopWorkspaceState {
  tabs: DesktopWorkspaceTab[];
  activeRoute: string | null;
  maxTabs: number;

  upsertFromRoute: (input: UpsertDesktopTabInput) => void;
  setActive: (route: string) => void;
  closeTab: (route: string) => void;
  closeOthers: (route: string) => void;
  closeAll: () => void;
  getNextAfterClose: (route: string) => string | null;
}

const DEFAULT_MAX_WORKSPACE_TABS = 8;

function nowIsoString(): string {
  return new Date().toISOString();
}

function pickEvictionIndex(
  tabs: DesktopWorkspaceTab[],
  activeRoute: string | null,
  protectedRoutes: string[]
): number {
  const protectedSet = new Set<string>([...protectedRoutes, ...(activeRoute ? [activeRoute] : [])]);

  const nonProtectedIdx = tabs.findIndex((tab) => !protectedSet.has(tab.route));
  if (nonProtectedIdx >= 0) {
    return nonProtectedIdx;
  }

  return 0;
}

export const useDesktopWorkspaceStore = create<DesktopWorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeRoute: null,
      maxTabs: DEFAULT_MAX_WORKSPACE_TABS,

      upsertFromRoute: ({ title, subtitle, route }) => {
        set((state) => {
          const ts = nowIsoString();
          const existingIndex = state.tabs.findIndex((tab) => tab.route === route);

          if (existingIndex >= 0) {
            const existing = state.tabs[existingIndex];
            if (!existing) {
              return state;
            }
            const nextTabs = [...state.tabs];
            nextTabs[existingIndex] = {
              ...existing,
              title,
              subtitle,
              updatedAt: ts,
            };

            return {
              tabs: nextTabs,
              activeRoute: route,
            };
          }

          const nextTab: DesktopWorkspaceTab = {
            route,
            title,
            subtitle,
            openedAt: ts,
            updatedAt: ts,
          };

          const nextTabs = [...state.tabs, nextTab];
          const maxTabs = state.maxTabs > 0 ? state.maxTabs : DEFAULT_MAX_WORKSPACE_TABS;

          if (nextTabs.length <= maxTabs) {
            return {
              tabs: nextTabs,
              activeRoute: route,
            };
          }

          const evictionIdx = pickEvictionIndex(nextTabs, state.activeRoute, [route]);
          nextTabs.splice(evictionIdx, 1);

          return {
            tabs: nextTabs,
            activeRoute: route,
          };
        });
      },

      setActive: (route) => {
        const tab = get().tabs.find((item) => item.route === route);
        if (!tab) {
          return;
        }
        set({ activeRoute: route });
      },

      closeTab: (route) => {
        set((state) => {
          const nextTabs = state.tabs.filter((tab) => tab.route !== route);
          const nextActive = state.activeRoute === route ? null : (state.activeRoute ?? null);
          return {
            tabs: nextTabs,
            activeRoute: nextActive,
          };
        });
      },

      closeOthers: (route) => {
        set((state) => {
          const keep = state.tabs.find((tab) => tab.route === route);
          if (!keep) {
            return state;
          }
          return {
            tabs: [keep],
            activeRoute: route,
          };
        });
      },

      closeAll: () => {
        set({
          tabs: [],
          activeRoute: null,
        });
      },

      getNextAfterClose: (route) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((tab) => tab.route === route);
        if (idx === -1) {
          return null;
        }

        const right = tabs[idx + 1];
        if (right) {
          return right.route;
        }

        const left = tabs[idx - 1];
        if (left) {
          return left.route;
        }

        return null;
      },
    }),
    {
      name: 'vitora-desktop-workspace',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeRoute: state.activeRoute,
        maxTabs: state.maxTabs,
      }),
    }
  )
);

/** @deprecated Workspace tabs now represent all desktop routes. */
export const useEncounterWorkspaceStore = useDesktopWorkspaceStore;
