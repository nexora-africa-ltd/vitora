import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';

describe('useNetworkStatus', () => {
  it('should return initial online status', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('should update when going offline', () => {
    const { result } = renderHook(() => useNetworkStatus());
    
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    
    expect(result.current.isOnline).toBe(false);
  });
});
