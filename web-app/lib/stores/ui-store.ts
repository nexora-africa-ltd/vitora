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
  id: string;
  route: string;
  title: string;
  subtitle?: string;
  openedAt: string;
  updatedAt: string;
}

interface DesktopTabInput {
  title: string;
  subtitle?: string;
  route: string;
}

interface DesktopWorkspaceState {
  tabs: DesktopWorkspaceTab[];
  activeTabId: string | null;
  maxTabs: number;

  /** Updates the current browser tab during ordinary in-app navigation. */
  updateActiveFromRoute: (input: DesktopTabInput) => void;
  /** Opens an entity in a new tab, or focuses its existing tab. */
  openTab: (input: DesktopTabInput) => void;
  setActive: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeAll: () => void;
  getNextAfterClose: (tabId: string) => DesktopWorkspaceTab | null;
}

const DEFAULT_MAX_WORKSPACE_TABS = 8;

function nowIsoString(): string {
  return new Date().toISOString();
}

function createTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickEvictionIndex(
  tabs: DesktopWorkspaceTab[],
  activeTabId: string | null,
  protectedTabIds: string[]
): number {
  const protectedSet = new Set<string>([...protectedTabIds, ...(activeTabId ? [activeTabId] : [])]);

  const nonProtectedIdx = tabs.findIndex((tab) => !protectedSet.has(tab.id));
  if (nonProtectedIdx >= 0) {
    return nonProtectedIdx;
  }

  return 0;
}

export const useDesktopWorkspaceStore = create<DesktopWorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      maxTabs: DEFAULT_MAX_WORKSPACE_TABS,

      updateActiveFromRoute: ({ title, subtitle, route }) => {
        set((state) => {
          const ts = nowIsoString();
          const existingIndex = state.tabs.findIndex(
            (tab) => tab.id === state.activeTabId || (!state.activeTabId && tab.route === route)
          );
          const existing = state.tabs[existingIndex];
          if (existing) {
            const nextTabs = [...state.tabs];
            nextTabs[existingIndex] = {
              ...existing,
              route,
              title,
              subtitle,
              updatedAt: ts,
            };

            return {
              tabs: nextTabs,
              activeTabId: existing.id,
            };
          }

          const nextTab: DesktopWorkspaceTab = {
            id: createTabId(),
            route,
            title,
            subtitle,
            openedAt: ts,
            updatedAt: ts,
          };

          const nextTabs = [...state.tabs, nextTab];
          const maxTabs = state.maxTabs > 0 ? state.maxTabs : DEFAULT_MAX_WORKSPACE_TABS;
          if (nextTabs.length > maxTabs) {
            nextTabs.splice(pickEvictionIndex(nextTabs, null, [nextTab.id]), 1);
          }
          return { tabs: nextTabs, activeTabId: nextTab.id };
        });
      },

      openTab: ({ title, subtitle, route }) => {
        set((state) => {
          const ts = nowIsoString();
          const existingIndex = state.tabs.findIndex((tab) => tab.route === route);
          const existing = state.tabs[existingIndex];
          if (existing) {
            const nextTabs = [...state.tabs];
            nextTabs[existingIndex] = { ...existing, title, subtitle, updatedAt: ts };
            return { tabs: nextTabs, activeTabId: existing.id };
          }

          const nextTab: DesktopWorkspaceTab = {
            id: createTabId(),
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
              activeTabId: nextTab.id,
            };
          }

          const evictionIdx = pickEvictionIndex(nextTabs, state.activeTabId, [nextTab.id]);
          nextTabs.splice(evictionIdx, 1);

          return {
            tabs: nextTabs,
            activeTabId: nextTab.id,
          };
        });
      },

      setActive: (tabId) => {
        const tab = get().tabs.find((item) => item.id === tabId);
        if (!tab) {
          return;
        }
        set({ activeTabId: tabId });
      },

      closeTab: (tabId) => {
        set((state) => {
          const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
          const nextActive = state.activeTabId === tabId ? null : state.activeTabId;
          return {
            tabs: nextTabs,
            activeTabId: nextActive,
          };
        });
      },

      closeOthers: (tabId) => {
        set((state) => {
          const keep = state.tabs.find((tab) => tab.id === tabId);
          if (!keep) {
            return state;
          }
          return {
            tabs: [keep],
            activeTabId: tabId,
          };
        });
      },

      closeAll: () => {
        set({
          tabs: [],
          activeTabId: null,
        });
      },

      getNextAfterClose: (tabId) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((tab) => tab.id === tabId);
        if (idx === -1) {
          return null;
        }

        const right = tabs[idx + 1];
        if (right) {
          return right;
        }

        const left = tabs[idx - 1];
        if (left) {
          return left;
        }

        return null;
      },
    }),
    {
      name: 'vitora-desktop-workspace',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as {
          tabs?: Array<Omit<DesktopWorkspaceTab, 'id'> & { id?: string }>;
          activeRoute?: string | null;
        };
        const tabs = (state.tabs ?? []).map((tab) => ({ ...tab, id: tab.id ?? createTabId() }));
        const activeTabId = tabs.find((tab) => tab.route === state.activeRoute)?.id ?? tabs[0]?.id ?? null;
        return { ...state, tabs, activeTabId };
      },
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        maxTabs: state.maxTabs,
      }),
    }
  )
);

/** @deprecated Workspace tabs now represent all desktop routes. */
export const useEncounterWorkspaceStore = useDesktopWorkspaceStore;
