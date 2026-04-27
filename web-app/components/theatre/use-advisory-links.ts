'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '@/lib/api/ai';
import type {
  AIAdvisoryOrderLink,
  AIAdvisoryResultType,
  AIAdvisoryOrderLinkActionRequest,
} from '@/lib/types/ai';

/**
 * Hook to manage advisory links for an AI result.
 *
 * - Seeds suggestion rows on mount (idempotent via get_or_create).
 * - Provides links grouped by category.
 * - Exposes action method and hasOrders state.
 */
export function useAdvisoryLinks(
  aiResultId: string | undefined,
  aiResultType: AIAdvisoryResultType,
) {
  const [links, setLinks] = useState<AIAdvisoryOrderLink[]>([]);
  const [hasOrders, setHasOrders] = useState(false);
  const [loading, setLoading] = useState(false);
  const seeded = useRef(false);

  // Seed + fetch links when aiResultId becomes available
  useEffect(() => {
    if (!aiResultId) {
      setLinks([]);
      setHasOrders(false);
      seeded.current = false;
      return;
    }

    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        // Seed (idempotent)
        if (!seeded.current) {
          const seedRes = await aiApi.seedAdvisoryLinks({
            ai_result_id: aiResultId,
            ai_result_type: aiResultType,
          });
          if (!cancelled) {
            setLinks(seedRes.links);
            seeded.current = true;
          }
        } else {
          const fetched = await aiApi.getAdvisoryLinks(aiResultId);
          if (!cancelled) setLinks(fetched);
        }

        // Check has-orders
        const ordersRes = await aiApi.advisoryHasOrders(aiResultId);
        if (!cancelled) setHasOrders(ordersRes.has_orders);
      } catch {
        // Silent — advisory links are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [aiResultId, aiResultType]);

  /** Action a single link (ORDERED / DECLINED / NOT_APPLICABLE). */
  const actionLink = useCallback(
    async (linkId: number, data: AIAdvisoryOrderLinkActionRequest) => {
      try {
        const updated = await aiApi.actionAdvisoryLink(linkId, data);
        setLinks((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l)),
        );
        // Re-check has-orders after action
        if (aiResultId) {
          const ordersRes = await aiApi.advisoryHasOrders(aiResultId);
          setHasOrders(ordersRes.has_orders);
        }
        return updated;
      } catch {
        return null;
      }
    },
    [aiResultId],
  );

  /** Refresh links from server. */
  const refresh = useCallback(async () => {
    if (!aiResultId) return;
    try {
      const [fetched, ordersRes] = await Promise.all([
        aiApi.getAdvisoryLinks(aiResultId),
        aiApi.advisoryHasOrders(aiResultId),
      ]);
      setLinks(fetched);
      setHasOrders(ordersRes.has_orders);
    } catch {
      // Silent
    }
  }, [aiResultId]);

  /** Find a link for a specific category + index. */
  const getLink = useCallback(
    (category: string, index: number) =>
      links.find(
        (l) => l.suggestion_category === category && l.suggestion_index === index,
      ),
    [links],
  );

  /** Get all links for a category. */
  const getLinksByCategory = useCallback(
    (category: string) => links.filter((l) => l.suggestion_category === category),
    [links],
  );

  return {
    links,
    hasOrders,
    loading,
    actionLink,
    refresh,
    getLink,
    getLinksByCategory,
  };
}
