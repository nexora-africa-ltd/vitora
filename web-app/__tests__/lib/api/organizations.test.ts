/**
 * Tests for the Organization API client (CRUD operations).
 */
import { organizationsApi } from '@/lib/api/organizations';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOrg = {
  id: 1,
  name: 'Demo Health Group',
  slug: 'demo-health-group',
  subscription_tier: 'PROFESSIONAL' as const,
  is_active: true,
  county_name: 'Nairobi',
  facility_count: 2,
  staff_count: 10,
};

const mockOrgDetail = {
  ...mockOrg,
  logo: null,
  contact_email: 'admin@demo.org',
  contact_phone: '+254700000000',
  address: '123 Health St',
  county: 1,
  sub_county: 1,
  sub_county_name: 'Westlands',
  max_facilities: 10,
  max_users: 50,
  data_retention_years: 7,
  settings: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockPaginated = {
  count: 1,
  next: null,
  previous: null,
  results: [mockOrg],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('organizationsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('fetches paginated organizations', async () => {
      mockClient.get.mockResolvedValueOnce({ data: mockPaginated });

      const result = await organizationsApi.list();

      expect(mockClient.get).toHaveBeenCalledWith('/api/organizations/', { params: undefined });
      expect(result.count).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('Demo Health Group');
    });

    it('passes query params to the API', async () => {
      mockClient.get.mockResolvedValueOnce({ data: mockPaginated });

      await organizationsApi.list({ search: 'demo', page: 2 });

      expect(mockClient.get).toHaveBeenCalledWith('/api/organizations/', {
        params: { search: 'demo', page: 2 },
      });
    });
  });

  describe('get', () => {
    it('fetches a single organization by ID', async () => {
      mockClient.get.mockResolvedValueOnce({ data: mockOrgDetail });

      const result = await organizationsApi.get(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/organizations/1/');
      expect(result.name).toBe('Demo Health Group');
      expect(result.slug).toBe('demo-health-group');
    });
  });

  describe('create', () => {
    it('creates a new organization', async () => {
      const createData = {
        name: 'New Health Org',
        org_type: 'hospital_group' as const,
        contact_email: 'new@org.com',
      };

      mockClient.post.mockResolvedValueOnce({
        data: { ...mockOrgDetail, ...createData, id: 2, slug: 'new-health-org' },
      });

      const result = await organizationsApi.create(createData);

      expect(mockClient.post).toHaveBeenCalledWith('/api/organizations/', createData);
      expect(result.name).toBe('New Health Org');
    });
  });

  describe('update', () => {
    it('partially updates an organization', async () => {
      const updateData = { name: 'Updated Name' };

      mockClient.patch.mockResolvedValueOnce({
        data: { ...mockOrgDetail, name: 'Updated Name' },
      });

      const result = await organizationsApi.update(1, updateData);

      expect(mockClient.patch).toHaveBeenCalledWith('/api/organizations/1/', updateData);
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('delete', () => {
    it('deletes an organization', async () => {
      mockClient.delete.mockResolvedValueOnce({ data: null });

      await organizationsApi.delete(1);

      expect(mockClient.delete).toHaveBeenCalledWith('/api/organizations/1/');
    });
  });

  describe('listFacilities', () => {
    it('fetches facilities for an organization', async () => {
      const mockFacilities = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 1, name: 'Main Clinic', mfl_code: '12345', level: '4', ownership: 'GOK', is_active: true, organization: 1, organization_name: 'Demo Health Group', county: 1, county_name: 'Nairobi', sub_county: 1, sub_county_name: 'Westlands', sha_contracted: true },
          { id: 2, name: 'Branch Clinic', mfl_code: '12346', level: '3', ownership: 'GOK', is_active: true, organization: 1, organization_name: 'Demo Health Group', county: 1, county_name: 'Nairobi', sub_county: 1, sub_county_name: 'Westlands', sha_contracted: false },
        ],
      };

      mockClient.get.mockResolvedValueOnce({ data: mockFacilities });

      const result = await organizationsApi.listFacilities(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/organizations/1/facilities/', {
        params: undefined,
      });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe('Main Clinic');
    });
  });
});
