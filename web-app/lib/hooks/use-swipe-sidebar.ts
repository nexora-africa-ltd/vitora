import { useEffect, useRef } from 'react';

interface UseSwipeSidebarOptions {
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  /** Minimum horizontal distance (px) to qualify as a swipe. Default: 50 */
  threshold?: number;
  /** Max vertical drift (px) before the gesture is cancelled. Default: 80 */
  maxVerticalDrift?: number;
  /** Left-edge zone width (px) where an open-swipe can start. Default: 30 */
  edgeWidth?: number;
}

/**
 * Adds touch-swipe gesture support for the mobile sidebar.
 *
 * - Swipe right from the left edge → open sidebar
 * - Swipe left anywhere (when open) → close sidebar
 *
 * Only active on screens where the hamburger icon is shown (< xl / 1280px).
 */
export function useSwipeSidebar({
  onOpen,
  onClose,
  isOpen,
  threshold = 50,
  maxVerticalDrift = 80,
  edgeWidth = 30,
}: UseSwipeSidebarOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const startedInEdge = useRef(false);

  useEffect(() => {
    function isDesktop() {
      return window.innerWidth >= 1280;
    }

    function handleTouchStart(e: TouchEvent) {
      if (isDesktop()) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      startedInEdge.current = touch.clientX <= edgeWidth;
    }

    function handleTouchEnd(e: TouchEvent) {
      if (isDesktop()) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);

      // Ignore if vertical movement is too large (user is scrolling)
      if (dy > maxVerticalDrift) return;

      // Swipe right → open (must start from left edge)
      if (!isOpen && dx > threshold && startedInEdge.current) {
        onOpen();
        return;
      }

      // Swipe left → close (anywhere on screen when open)
      if (isOpen && dx < -threshold) {
        onClose();
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen, onOpen, onClose, threshold, maxVerticalDrift, edgeWidth]);
}
