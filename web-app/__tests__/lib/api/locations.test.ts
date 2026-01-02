/**
 * TDD Tests for Locations API
 * Tests Kenya locations API endpoints (counties, sub-counties, wards)
 */
import { locationsApi, County, SubCounty, Ward } from '@/lib/api/locations';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Locations API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCounties', () => {
    it('should fetch all counties', async () => {
      const mockCounties: County[] = [
        { id: 1, code: 1, name: 'Mombasa' },
        { id: 2, code: 2, name: 'Kwale' },
        { id: 47, code: 47, name: 'Nairobi' },
      ];

      mockApiClient.get.mockResolvedValue({ data: mockCounties });

      const result = await locationsApi.getCounties();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/locations/counties/');
      expect(result).toEqual(mockCounties);
    });

    it('should return empty array when no counties', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      const result = await locationsApi.getCounties();

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      const error = new Error('Network error');
      mockApiClient.get.mockRejectedValue(error);

      await expect(locationsApi.getCounties()).rejects.toThrow('Network error');
    });
  });

  describe('getSubCounties', () => {
    it('should fetch sub-counties for a county', async () => {
      const mockSubCounties: SubCounty[] = [
        { id: 101, county: 1, name: 'Mvita' },
        { id: 102, county: 1, name: 'Nyali' },
        { id: 103, county: 1, name: 'Likoni' },
      ];

      mockApiClient.get.mockResolvedValue({ data: mockSubCounties });

      const result = await locationsApi.getSubCounties(1);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/locations/sub-counties/',
        { params: { county: 1 } }
      );
      expect(result).toEqual(mockSubCounties);
    });

    it('should pass correct county parameter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      await locationsApi.getSubCounties(47);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/locations/sub-counties/',
        { params: { county: 47 } }
      );
    });

    it('should return empty array for county with no sub-counties', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      const result = await locationsApi.getSubCounties(999);

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      const error = new Error('County not found');
      mockApiClient.get.mockRejectedValue(error);

      await expect(locationsApi.getSubCounties(999)).rejects.toThrow('County not found');
    });
  });

  describe('getWards', () => {
    it('should fetch wards for a sub-county', async () => {
      const mockWards: Ward[] = [
        { id: 1001, sub_county: 101, name: 'Mji wa Kale' },
        { id: 1002, sub_county: 101, name: 'Tudor' },
        { id: 1003, sub_county: 101, name: 'Ganjoni' },
      ];

      mockApiClient.get.mockResolvedValue({ data: mockWards });

      const result = await locationsApi.getWards(101);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/locations/wards/',
        { params: { sub_county: 101 } }
      );
      expect(result).toEqual(mockWards);
    });

    it('should pass correct sub_county parameter', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      await locationsApi.getWards(202);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/locations/wards/',
        { params: { sub_county: 202 } }
      );
    });

    it('should return empty array for sub-county with no wards', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      const result = await locationsApi.getWards(999);

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      const error = new Error('Sub-county not found');
      mockApiClient.get.mockRejectedValue(error);

      await expect(locationsApi.getWards(999)).rejects.toThrow('Sub-county not found');
    });
  });

  describe('Type definitions', () => {
    it('should have correct County shape', () => {
      const county: County = {
        id: 1,
        code: 1,
        name: 'Mombasa',
      };

      expect(county.id).toBe(1);
      expect(county.code).toBe(1);
      expect(county.name).toBe('Mombasa');
    });

    it('should have correct SubCounty shape', () => {
      const subCounty: SubCounty = {
        id: 101,
        county: 1,
        name: 'Mvita',
      };

      expect(subCounty.id).toBe(101);
      expect(subCounty.county).toBe(1);
      expect(subCounty.name).toBe('Mvita');
    });

    it('should have correct Ward shape', () => {
      const ward: Ward = {
        id: 1001,
        sub_county: 101,
        name: 'Mji wa Kale',
      };

      expect(ward.id).toBe(1001);
      expect(ward.sub_county).toBe(101);
      expect(ward.name).toBe('Mji wa Kale');
    });
  });

  describe('Integration scenarios', () => {
    it('should support cascading location fetch', async () => {
      // Simulate fetching county -> sub-county -> ward cascade
      const mockCounties: County[] = [{ id: 47, code: 47, name: 'Nairobi' }];
      const mockSubCounties: SubCounty[] = [{ id: 301, county: 47, name: 'Westlands' }];
      const mockWards: Ward[] = [{ id: 3001, sub_county: 301, name: 'Parklands' }];

      mockApiClient.get
        .mockResolvedValueOnce({ data: mockCounties })
        .mockResolvedValueOnce({ data: mockSubCounties })
        .mockResolvedValueOnce({ data: mockWards });

      const counties = await locationsApi.getCounties();
      const subCounties = await locationsApi.getSubCounties(counties[0]!.id);
      const wards = await locationsApi.getWards(subCounties[0]!.id);

      expect(counties).toHaveLength(1);
      expect(subCounties).toHaveLength(1);
      expect(wards).toHaveLength(1);
      expect(wards[0]!.name).toBe('Parklands');
    });
  });
});
