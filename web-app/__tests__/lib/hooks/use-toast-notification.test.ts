/**
 * TDD Tests for useToastNotification Hook
 * Tests toast notification functionality
 */
import { renderHook, act } from '@testing-library/react';
import { useToastNotification } from '@/lib/hooks/use-toast-notification';

// Mock the toast function
const mockToast = jest.fn();
jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: jest.fn(),
  toast: (...args: any[]) => mockToast(...args),
}));

describe('useToastNotification', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('should show success toast', () => {
    const { result } = renderHook(() => useToastNotification());

    act(() => {
      result.current.success('Success!', 'Operation completed');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Success!',
      description: 'Operation completed',
      variant: 'default',
    });
  });

  it('should show error toast with string message', () => {
    const { result } = renderHook(() => useToastNotification());

    act(() => {
      result.current.error('Something went wrong');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Something went wrong',
      variant: 'destructive',
    });
  });

  it('should show error toast with Error object', () => {
    const { result } = renderHook(() => useToastNotification());
    const error = new Error('Network failed');

    act(() => {
      result.current.error(error);
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Network failed',
      variant: 'destructive',
    });
  });

  it('should show error toast with custom title', () => {
    const { result } = renderHook(() => useToastNotification());

    act(() => {
      result.current.error('Invalid input', 'Validation Error');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Validation Error',
      description: 'Invalid input',
      variant: 'destructive',
    });
  });

  it('should show warning toast', () => {
    const { result } = renderHook(() => useToastNotification());

    act(() => {
      result.current.warning('Warning', 'Please check your input');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Warning',
      description: 'Please check your input',
      variant: 'default',
      className: 'bg-amber-50 border-amber-200 text-amber-900',
    });
  });

  it('should show info toast', () => {
    const { result } = renderHook(() => useToastNotification());

    act(() => {
      result.current.info('Info', 'Here is some information');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Info',
      description: 'Here is some information',
      variant: 'default',
    });
  });
});
