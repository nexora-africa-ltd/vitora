/**
 * Locations API Tests
 *
 * Tests for Kenya locations API (counties, sub-counties, wards).
 * Following TDD RED-GREEN-REFACTOR approach.
 */

import { locationsApi, County, SubCounty, Ward } from '../../lib/api/locations';
import { getApiClient } from '../../lib/api/client';

// Mock the API client
jest.mock('../../lib/api/client', () => ({
  getApiClient: jest.fn(),
}));

const mockGetApiClient = getApiClient as jest.MockedFunction<typeof getApiClient>;

describe('Locations API Tests', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache before each test to ensure isolation
    locationsApi.clearCache();
    mockClient = {
      get: jest.fn(),
    };
    mockGetApiClient.mockReturnValue(mockClient);
  });

  describe('getCounties', () => {
    test('should fetch all 47 Kenya counties', async () => {
      const mockCounties = [
        { id: 1, code: 1, name: 'Mombasa' },
        { id: 2, code: 2, name: 'Kwale' },
        { id: 47, code: 47, name: 'Nairobi' },
      ];
      mockClient.get.mockResolvedValue({ data: mockCounties });

      const result = await locationsApi.getCounties();

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/counties/');
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Mombasa');
    });

    test('should cache counties after first fetch', async () => {
      const mockCounties = [{ id: 1, code: 1, name: 'Mombasa' }];
      mockClient.get.mockResolvedValue({ data: mockCounties });

      await locationsApi.getCounties();
      await locationsApi.getCounties();

      // Should only call API once due to caching
      expect(mockClient.get).toHaveBeenCalledTimes(1);
    });

    test('should allow cache bypass with force flag', async () => {
      const mockCounties = [{ id: 1, code: 1, name: 'Mombasa' }];
      mockClient.get.mockResolvedValue({ data: mockCounties });

      await locationsApi.getCounties();
      await locationsApi.getCounties(true); // force refresh

      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSubCounties', () => {
    test('should fetch sub-counties for a county', async () => {
      const mockSubCounties = [
        { id: 1, name: 'Changamwe', county: 1 },
        { id: 2, name: 'Jomvu', county: 1 },
        { id: 3, name: 'Kisauni', county: 1 },
      ];
      mockClient.get.mockResolvedValue({ data: mockSubCounties });

      const result = await locationsApi.getSubCounties(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/sub-counties/', {
        params: { county: 1 },
      });
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Changamwe');
    });

    test('should return empty array for invalid county', async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const result = await locationsApi.getSubCounties(999);

      expect(result).toHaveLength(0);
    });
  });

  describe('getWards', () => {
    test('should fetch wards for a sub-county', async () => {
      const mockWards = [
        { id: 1, name: 'Chaani', sub_county: 1 },
        { id: 2, name: 'Port Reitz', sub_county: 1 },
      ];
      mockClient.get.mockResolvedValue({ data: mockWards });

      const result = await locationsApi.getWards(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/wards/', {
        params: { sub_county: 1 },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getCountyById', () => {
    test('should fetch single county by ID', async () => {
      mockClient.get.mockResolvedValue({
        data: { id: 1, code: 1, name: 'Mombasa' },
      });

      const result = await locationsApi.getCountyById(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/counties/1/');
      expect(result.name).toBe('Mombasa');
    });
  });

  describe('getSubCountyById', () => {
    test('should fetch single sub-county by ID', async () => {
      mockClient.get.mockResolvedValue({
        data: { id: 1, name: 'Changamwe', county: 1 },
      });

      const result = await locationsApi.getSubCountyById(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/sub-counties/1/');
      expect(result.name).toBe('Changamwe');
    });
  });

  describe('searchLocations', () => {
    test('should search counties by name', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ id: 1, code: 1, name: 'Mombasa' }],
      });

      const result = await locationsApi.searchCounties('Momb');

      expect(mockClient.get).toHaveBeenCalledWith('/api/locations/counties/', {
        params: { search: 'Momb' },
      });
      expect(result[0].name).toBe('Mombasa');
    });
  });

  describe('clearCache', () => {
    test('should clear location cache', async () => {
      const mockCounties = [{ id: 1, code: 1, name: 'Mombasa' }];
      mockClient.get.mockResolvedValue({ data: mockCounties });

      await locationsApi.getCounties();
      locationsApi.clearCache();
      await locationsApi.getCounties();

      // Should call API twice after cache clear
      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });
  });
});
