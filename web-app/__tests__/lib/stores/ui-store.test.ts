import { useDesktopWorkspaceStore, useUIStore } from '@/lib/stores/ui-store';

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

describe('Desktop Workspace Store', () => {
  beforeEach(() => {
    const initialState = useDesktopWorkspaceStore.getInitialState();
    useDesktopWorkspaceStore.setState(initialState, true);
    localStorage.clear();
  });

  it('should create and activate a tab for any dashboard route', () => {
    useDesktopWorkspaceStore.getState().upsertFromRoute({
      title: 'Patients',
      route: '/encounters/101',
    });

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.route).toBe('/encounters/101');
    expect(state.activeRoute).toBe('/encounters/101');
  });

  it('should update an existing route tab without duplication', () => {
    const store = useDesktopWorkspaceStore.getState();
    store.upsertFromRoute({
      title: 'Patient record',
      route: '/patients/101',
    });
    store.upsertFromRoute({
      title: 'Jane Doe',
      route: '/patients/101',
    });

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.title).toBe('Jane Doe');
  });

  it('should cap tabs and preserve the active route', () => {
    const store = useDesktopWorkspaceStore.getState();
    for (let i = 1; i <= 9; i += 1) {
      store.upsertFromRoute({
        title: `Page ${i}`,
        route: `/page-${i}`,
      });
    }

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(8);
    expect(state.tabs.some((tab) => tab.route === '/page-9')).toBe(true);
    expect(state.activeRoute).toBe('/page-9');
  });

  it('should return right-side tab first when closing active tab', () => {
    const store = useDesktopWorkspaceStore.getState();
    ['/patients', '/encounters', '/triage'].forEach((route) => {
      store.upsertFromRoute({
        title: route,
        route,
      });
    });

    const next = store.getNextAfterClose('/encounters');
    expect(next).toBe('/triage');
  });

  it('should close others and keep only the selected page tab', () => {
    const store = useDesktopWorkspaceStore.getState();
    ['/patients', '/encounters', '/triage'].forEach((route) => {
      store.upsertFromRoute({
        title: route,
        route,
      });
    });

    store.closeOthers('/encounters');
    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.route).toBe('/encounters');
    expect(state.activeRoute).toBe('/encounters');
  });
});
