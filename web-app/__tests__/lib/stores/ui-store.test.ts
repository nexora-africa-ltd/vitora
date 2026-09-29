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

  it('should initialize one tab and update its route during normal navigation', () => {
    const store = useDesktopWorkspaceStore.getState();
    store.updateActiveFromRoute({
      title: 'Patients',
      route: '/patients',
    });
    const tabId = useDesktopWorkspaceStore.getState().tabs[0]?.id;
    store.updateActiveFromRoute({
      title: 'Patient record',
      route: '/patients/101',
    });

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      id: tabId,
      route: '/patients/101',
      title: 'Patient record',
    });
    expect(state.activeTabId).toBe(tabId);
  });

  it('should focus an explicitly opened entity tab instead of duplicating it', () => {
    const store = useDesktopWorkspaceStore.getState();
    store.updateActiveFromRoute({
      title: 'Patient record',
      route: '/patients',
    });
    const firstTabId = useDesktopWorkspaceStore.getState().activeTabId;
    store.openTab({
      title: 'Jane Doe',
      route: '/patients/101',
    });
    const entityTabId = useDesktopWorkspaceStore.getState().activeTabId;
    store.setActive(firstTabId!);
    store.openTab({
      title: 'Jane Doe updated',
      route: '/patients/101',
    });

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(entityTabId);
    expect(state.tabs.find((tab) => tab.id === entityTabId)).toMatchObject({
      route: '/patients/101',
      title: 'Jane Doe updated',
    });
  });

  it('should cap tabs and preserve the active route', () => {
    const store = useDesktopWorkspaceStore.getState();
    for (let i = 1; i <= 9; i += 1) {
      store.openTab({
        title: `Page ${i}`,
        route: `/page-${i}`,
      });
    }

    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(8);
    expect(state.tabs.some((tab) => tab.route === '/page-9')).toBe(true);
    expect(state.tabs.find((tab) => tab.id === state.activeTabId)?.route).toBe('/page-9');
  });

  it('should return right-side tab first when closing active tab', () => {
    const store = useDesktopWorkspaceStore.getState();
    ['/patients', '/encounters', '/triage'].forEach((route) => {
      store.openTab({
        title: route,
        route,
      });
    });

    const encounterTabId = useDesktopWorkspaceStore.getState().tabs[1]?.id;
    const next = store.getNextAfterClose(encounterTabId!);
    expect(next?.route).toBe('/triage');

    store.closeTab(encounterTabId!);
    store.updateActiveFromRoute({ title: '/triage', route: '/triage' });
    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(next?.id);
  });

  it('should close others and keep only the selected page tab', () => {
    const store = useDesktopWorkspaceStore.getState();
    ['/patients', '/encounters', '/triage'].forEach((route) => {
      store.openTab({
        title: route,
        route,
      });
    });

    const encounterTabId = useDesktopWorkspaceStore.getState().tabs[1]?.id;
    store.closeOthers(encounterTabId!);
    const state = useDesktopWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.route).toBe('/encounters');
    expect(state.activeTabId).toBe(encounterTabId);
  });
});
