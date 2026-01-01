import { useUIStore } from '@/lib/stores/ui-store';

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
