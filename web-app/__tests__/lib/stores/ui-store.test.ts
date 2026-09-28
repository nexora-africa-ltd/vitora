import { useEncounterWorkspaceStore, useUIStore } from '@/lib/stores/ui-store';

describe('UI Store', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: 'system',
      unreadNotifications: 0,
      isGlobalLoading: false,
    });
  });

  it('should toggle sidebar', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    useUIStore.getState().toggleSidebar();

    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should set sidebar collapsed state', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should set theme', () => {
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('should set unread notifications count', () => {
    useUIStore.getState().setUnreadNotifications(5);
    expect(useUIStore.getState().unreadNotifications).toBe(5);
  });
});

describe('Encounter Workspace Store', () => {
  beforeEach(() => {
    const initialState = useEncounterWorkspaceStore.getInitialState();
    useEncounterWorkspaceStore.setState(initialState, true);
    localStorage.clear();
  });

  it('should create and activate a tab from route', () => {
    useEncounterWorkspaceStore.getState().upsertFromRoute({
      encounterId: 101,
      title: 'Jane Doe',
      subtitle: 'MRN-001',
      status: 'IN_PROGRESS',
      route: '/encounters/101',
    });

    const state = useEncounterWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.lastRoute).toBe('/encounters/101');
    expect(state.activeEncounterId).toBe(101);
  });

  it('should update route for existing tab without duplication', () => {
    const store = useEncounterWorkspaceStore.getState();
    store.upsertFromRoute({
      encounterId: 101,
      title: 'Jane Doe',
      subtitle: 'MRN-001',
      status: 'IN_PROGRESS',
      route: '/encounters/101',
    });
    store.upsertFromRoute({
      encounterId: 101,
      title: 'Jane Doe',
      subtitle: 'MRN-001',
      status: 'IN_PROGRESS',
      route: '/encounters/101/edit/review',
    });

    const state = useEncounterWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.lastRoute).toBe('/encounters/101/edit/review');
  });

  it('should cap tabs and preserve active/new encounter', () => {
    const store = useEncounterWorkspaceStore.getState();
    for (let i = 1; i <= 9; i += 1) {
      store.upsertFromRoute({
        encounterId: i,
        title: `Encounter ${i}`,
        route: `/encounters/${i}`,
      });
    }

    const state = useEncounterWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(8);
    expect(state.tabs.some((tab) => tab.encounterId === 9)).toBe(true);
    expect(state.activeEncounterId).toBe(9);
  });

  it('should return right-side tab first when closing active tab', () => {
    const store = useEncounterWorkspaceStore.getState();
    [10, 11, 12].forEach((id) => {
      store.upsertFromRoute({
        encounterId: id,
        title: `Encounter ${id}`,
        route: `/encounters/${id}`,
      });
    });

    const next = store.getNextAfterClose(11);
    expect(next).toBe(12);
  });

  it('should close others and keep only selected encounter tab', () => {
    const store = useEncounterWorkspaceStore.getState();
    [21, 22, 23].forEach((id) => {
      store.upsertFromRoute({
        encounterId: id,
        title: `Encounter ${id}`,
        route: `/encounters/${id}`,
      });
    });

    store.closeOthers(22);
    const state = useEncounterWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.encounterId).toBe(22);
    expect(state.activeEncounterId).toBe(22);
  });
});
