/**
 * Tests for imaging Zod schemas.
 * Phase B: Frontend Order Management
 */

import {
  ImagingModalitySchema,
  ImagingBodyRegionSchema,
  ImagingOrderStatusSchema,
  ImagingPrioritySchema,
  LateralitySchema,
  ImagingProcedureSchema,
  ImagingProcedureDetailSchema,
  ImagingOrderItemSchema,
  ImagingOrderSchema,
  PaginatedImagingProcedureSchema,
  PaginatedImagingOrderSchema,
} from '@/lib/schemas/imaging.schema';

describe('Imaging Zod Schemas', () => {
  describe('ImagingModalitySchema', () => {
    it.each(['XR', 'US', 'CT', 'MRI', 'NM', 'MG', 'FL', 'OTHER'])(
      'accepts valid modality: %s',
      (modality) => {
        expect(ImagingModalitySchema.parse(modality)).toBe(modality);
      }
    );

    it('rejects invalid modality', () => {
      expect(() => ImagingModalitySchema.parse('INVALID')).toThrow();
    });
  });

  describe('ImagingBodyRegionSchema', () => {
    it.each([
      'HEAD',
      'NECK',
      'CHEST',
      'ABDOMEN',
      'PELVIS',
      'SPINE',
      'UPPER_EXTREMITY',
      'LOWER_EXTREMITY',
      'WHOLE_BODY',
      'OTHER',
    ])('accepts valid body region: %s', (region) => {
      expect(ImagingBodyRegionSchema.parse(region)).toBe(region);
    });

    it('rejects invalid body region', () => {
      expect(() => ImagingBodyRegionSchema.parse('INVALID')).toThrow();
    });
  });

  describe('ImagingOrderStatusSchema', () => {
    it.each([
      'DRAFT',
      'ORDERED',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
      'REPORTED',
      'CANCELLED',
    ])('accepts valid status: %s', (status) => {
      expect(ImagingOrderStatusSchema.parse(status)).toBe(status);
    });

    it('rejects invalid status', () => {
      expect(() => ImagingOrderStatusSchema.parse('INVALID')).toThrow();
    });
  });

  describe('ImagingPrioritySchema', () => {
    it.each(['ROUTINE', 'URGENT', 'STAT'])('accepts valid priority: %s', (priority) => {
      expect(ImagingPrioritySchema.parse(priority)).toBe(priority);
    });

    it('rejects invalid priority', () => {
      expect(() => ImagingPrioritySchema.parse('INVALID')).toThrow();
    });
  });

  describe('LateralitySchema', () => {
    it.each(['NA', 'LEFT', 'RIGHT', 'BILATERAL'])('accepts valid laterality: %s', (lat) => {
      expect(LateralitySchema.parse(lat)).toBe(lat);
    });

    it('rejects invalid laterality', () => {
      expect(() => LateralitySchema.parse('INVALID')).toThrow();
    });
  });

  describe('ImagingProcedureSchema', () => {
    const validProcedure = {
      id: 1,
      code: 'XR-CHEST',
      name: 'Chest X-Ray',
      modality: 'XR',
      body_region: 'CHEST',
      cost: 1500,
      sha_claimable: true,
      available_in_house: true,
      is_active: true,
    };

    it('accepts valid procedure', () => {
      const result = ImagingProcedureSchema.parse(validProcedure);
      expect(result.code).toBe('XR-CHEST');
      expect(result.modality).toBe('XR');
    });

    it('transforms string cost to number', () => {
      const withStringCost = { ...validProcedure, cost: '1500.00' };
      const result = ImagingProcedureSchema.parse(withStringCost);
      expect(result.cost).toBe(1500);
    });

    it('rejects procedure with missing required fields', () => {
      const invalid = { id: 1, code: 'XR-CHEST' };
      expect(() => ImagingProcedureSchema.parse(invalid)).toThrow();
    });

    it('rejects procedure with invalid modality', () => {
      const invalid = { ...validProcedure, modality: 'INVALID' };
      expect(() => ImagingProcedureSchema.parse(invalid)).toThrow();
    });
  });

  describe('ImagingProcedureDetailSchema', () => {
    const validDetail = {
      id: 1,
      code: 'XR-CHEST',
      name: 'Chest X-Ray',
      modality: 'XR',
      body_region: 'CHEST',
      cost: 1500,
      sha_claimable: true,
      available_in_house: true,
      is_active: true,
      radlex_code: 'RID12345',
      loinc_code: '12345-6',
      requires_contrast: false,
      requires_sedation: false,
      special_preparation: null,
      turnaround_hours: 24,
      sha_intervention_code: 'SHA-IMG-001',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    it('accepts valid procedure detail', () => {
      const result = ImagingProcedureDetailSchema.parse(validDetail);
      expect(result.turnaround_hours).toBe(24);
      expect(result.requires_contrast).toBe(false);
    });

    it('accepts null optional fields', () => {
      const withNulls = {
        ...validDetail,
        radlex_code: null,
        loinc_code: null,
        special_preparation: null,
        sha_intervention_code: null,
      };
      const result = ImagingProcedureDetailSchema.parse(withNulls);
      expect(result.radlex_code).toBeNull();
    });
  });

  describe('ImagingOrderItemSchema', () => {
    const validItem = {
      id: 1,
      procedure: 1,
      procedure_name: 'Chest X-Ray',
      procedure_code: 'XR-CHEST',
      modality: 'XR',
      laterality: 'NA',
      specific_instructions: null,
      is_completed: false,
      completed_at: null,
      unit_cost: 1500,
    };

    it('accepts valid order item', () => {
      const result = ImagingOrderItemSchema.parse(validItem);
      expect(result.procedure_name).toBe('Chest X-Ray');
    });

    it('transforms string unit_cost to number', () => {
      const withStringCost = { ...validItem, unit_cost: '1500.00' };
      const result = ImagingOrderItemSchema.parse(withStringCost);
      expect(result.unit_cost).toBe(1500);
    });
  });

  describe('ImagingOrderSchema', () => {
    const validOrder = {
      id: 1,
      order_number: 'RAD-20250101-0001',
      patient: 123,
      patient_name: 'John Doe',
      encounter: 456,
      ordered_by: 789,
      ordered_by_name: 'Dr. Smith',
      priority: 'ROUTINE',
      clinical_indication: 'Suspected pneumonia',
      relevant_clinical_history: null,
      status: 'ORDERED',
      scheduled_datetime: null,
      scheduled_room: null,
      accession_number: null,
      study_instance_uid: null,
      total_cost: 1500,
      is_paid: false,
      items: [
        {
          id: 1,
          procedure: 1,
          procedure_name: 'Chest X-Ray',
          procedure_code: 'XR-CHEST',
          modality: 'XR',
          laterality: 'NA',
          specific_instructions: null,
          is_completed: false,
          completed_at: null,
          unit_cost: 1500,
        },
      ],
      ordered_at: '2025-01-01T10:00:00Z',
      completed_at: null,
    };

    it('accepts valid order', () => {
      const result = ImagingOrderSchema.parse(validOrder);
      expect(result.order_number).toBe('RAD-20250101-0001');
      expect(result.items).toHaveLength(1);
    });

    it('transforms string total_cost to number', () => {
      const withStringCost = { ...validOrder, total_cost: '1500.00' };
      const result = ImagingOrderSchema.parse(withStringCost);
      expect(result.total_cost).toBe(1500);
    });

    it('rejects order with invalid status', () => {
      const invalid = { ...validOrder, status: 'INVALID' };
      expect(() => ImagingOrderSchema.parse(invalid)).toThrow();
    });

    it('rejects order with invalid priority', () => {
      const invalid = { ...validOrder, priority: 'INVALID' };
      expect(() => ImagingOrderSchema.parse(invalid)).toThrow();
    });
  });

  describe('PaginatedImagingProcedureSchema', () => {
    it('accepts valid paginated response', () => {
      const paginated = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            code: 'XR-CHEST',
            name: 'Chest X-Ray',
            modality: 'XR',
            body_region: 'CHEST',
            cost: 1500,
            sha_claimable: true,
            available_in_house: true,
            is_active: true,
          },
        ],
      };
      const result = PaginatedImagingProcedureSchema.parse(paginated);
      expect(result.count).toBe(1);
      expect(result.results).toHaveLength(1);
    });
  });

  describe('PaginatedImagingOrderSchema', () => {
    it('accepts valid paginated response', () => {
      const paginated = {
        count: 0,
        next: null,
        previous: null,
        results: [],
      };
      const result = PaginatedImagingOrderSchema.parse(paginated);
      expect(result.count).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });
});
