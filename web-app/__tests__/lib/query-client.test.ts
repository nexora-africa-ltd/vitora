import { createQueryClient, queryKeys } from '@/lib/query-client';

describe('Query Client', () => {
  it('should create query client with default options', () => {
    const client = createQueryClient();
    expect(client).toBeDefined();
  });

  it('should have correct default stale time', () => {
    const client = createQueryClient();
    const options = client.getDefaultOptions();
    expect(options.queries?.staleTime).toBe(60 * 1000);
  });
});

describe('Query Keys', () => {
  it('should generate patient list key', () => {
    const key = queryKeys.patients.list({ page: 1 });
    expect(key).toEqual(['patients', 'list', { page: 1 }]);
  });

  it('should generate patient detail key', () => {
    const key = queryKeys.patients.detail(123);
    expect(key).toEqual(['patients', 'detail', 123]);
  });
});
