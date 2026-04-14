import { useCallback, useState } from 'react';

import { queryClient } from '@/lib/query/client';

type QueryKey = ReadonlyArray<unknown>;

export function useRefreshQueries(queryKeys: ReadonlyArray<QueryKey>) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    } finally {
      setIsRefreshing(false);
    }
  }, [queryKeys]);

  return {
    isRefreshing,
    refresh,
  };
}
