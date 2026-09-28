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

export interface EncounterWorkspaceTab {
  encounterId: number;
  title: string;
  subtitle?: string;
  status?: string;
  lastRoute: string;
  openedAt: string;
  updatedAt: string;
}

interface UpsertEncounterTabInput {
  encounterId: number;
  title: string;
  subtitle?: string;
  status?: string;
  route: string;
}

interface EncounterWorkspaceState {
  tabs: EncounterWorkspaceTab[];
  activeEncounterId: number | null;
  maxTabs: number;

  upsertFromRoute: (input: UpsertEncounterTabInput) => void;
  setActive: (encounterId: number) => void;
  updateRoute: (encounterId: number, route: string) => void;
  closeTab: (encounterId: number) => void;
  closeOthers: (encounterId: number) => void;
  closeAll: () => void;
  getTab: (encounterId: number) => EncounterWorkspaceTab | null;
  getNextAfterClose: (encounterId: number) => number | null;
}

const DEFAULT_MAX_WORKSPACE_TABS = 8;

function nowIsoString(): string {
  return new Date().toISOString();
}

function pickEvictionIndex(
  tabs: EncounterWorkspaceTab[],
  activeEncounterId: number | null,
  protectedEncounterIds: number[]
): number {
  const protectedSet = new Set<number>([
    ...protectedEncounterIds,
    ...(activeEncounterId ? [activeEncounterId] : []),
  ]);

  const nonProtectedIdx = tabs.findIndex((tab) => !protectedSet.has(tab.encounterId));
  if (nonProtectedIdx >= 0) {
    return nonProtectedIdx;
  }

  return 0;
}

export const useEncounterWorkspaceStore = create<EncounterWorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeEncounterId: null,
      maxTabs: DEFAULT_MAX_WORKSPACE_TABS,

      upsertFromRoute: ({ encounterId, title, subtitle, status, route }) => {
        set((state) => {
          const ts = nowIsoString();
          const existingIndex = state.tabs.findIndex((tab) => tab.encounterId === encounterId);

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
              status,
              lastRoute: route,
              updatedAt: ts,
            };

            return {
              tabs: nextTabs,
              activeEncounterId: encounterId,
            };
          }

          const nextTab: EncounterWorkspaceTab = {
            encounterId,
            title,
            subtitle,
            status,
            lastRoute: route,
            openedAt: ts,
            updatedAt: ts,
          };

          const nextTabs = [...state.tabs, nextTab];
          const maxTabs = state.maxTabs > 0 ? state.maxTabs : DEFAULT_MAX_WORKSPACE_TABS;

          if (nextTabs.length <= maxTabs) {
            return {
              tabs: nextTabs,
              activeEncounterId: encounterId,
            };
          }

          const evictionIdx = pickEvictionIndex(nextTabs, state.activeEncounterId, [encounterId]);
          nextTabs.splice(evictionIdx, 1);

          return {
            tabs: nextTabs,
            activeEncounterId: encounterId,
          };
        });
      },

      setActive: (encounterId) => {
        const tab = get().tabs.find((item) => item.encounterId === encounterId);
        if (!tab) {
          return;
        }
        set({ activeEncounterId: encounterId });
      },

      updateRoute: (encounterId, route) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.encounterId === encounterId
              ? {
                  ...tab,
                  lastRoute: route,
                  updatedAt: nowIsoString(),
                }
              : tab
          ),
        }));
      },

      closeTab: (encounterId) => {
        set((state) => {
          const nextTabs = state.tabs.filter((tab) => tab.encounterId !== encounterId);
          const nextActive =
            state.activeEncounterId === encounterId ? null : (state.activeEncounterId ?? null);
          return {
            tabs: nextTabs,
            activeEncounterId: nextActive,
          };
        });
      },

      closeOthers: (encounterId) => {
        set((state) => {
          const keep = state.tabs.find((tab) => tab.encounterId === encounterId);
          if (!keep) {
            return state;
          }
          return {
            tabs: [keep],
            activeEncounterId: encounterId,
          };
        });
      },

      closeAll: () => {
        set({
          tabs: [],
          activeEncounterId: null,
        });
      },

      getTab: (encounterId) => {
        return get().tabs.find((tab) => tab.encounterId === encounterId) || null;
      },

      getNextAfterClose: (encounterId) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((tab) => tab.encounterId === encounterId);
        if (idx === -1) {
          return null;
        }

        const right = tabs[idx + 1];
        if (right) {
          return right.encounterId;
        }

        const left = tabs[idx - 1];
        if (left) {
          return left.encounterId;
        }

        return null;
      },
    }),
    {
      name: 'vitora-encounter-workspace',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeEncounterId: state.activeEncounterId,
        maxTabs: state.maxTabs,
      }),
    }
  )
);
