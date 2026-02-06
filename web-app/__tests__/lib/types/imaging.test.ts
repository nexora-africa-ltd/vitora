/**
 * Tests for imaging types.
 * Phase B: Frontend Order Management
 */

import {
  ImagingModality,
  ImagingBodyRegion,
  ImagingOrderStatus,
  ImagingPriority,
  Laterality,
  MODALITY_LABELS,
  BODY_REGION_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  LATERALITY_LABELS,
} from '@/lib/types/imaging';

describe('Imaging Types', () => {
  describe('MODALITY_LABELS', () => {
    it('contains all modalities', () => {
      const modalities: ImagingModality[] = ['XR', 'US', 'CT', 'MRI', 'NM', 'MG', 'FL', 'OTHER'];
      modalities.forEach((modality) => {
        expect(MODALITY_LABELS[modality]).toBeDefined();
        expect(typeof MODALITY_LABELS[modality]).toBe('string');
      });
    });

    it('has correct labels', () => {
      expect(MODALITY_LABELS.XR).toBe('X-Ray');
      expect(MODALITY_LABELS.US).toBe('Ultrasound');
      expect(MODALITY_LABELS.CT).toBe('Computed Tomography');
      expect(MODALITY_LABELS.MRI).toBe('Magnetic Resonance Imaging');
      expect(MODALITY_LABELS.NM).toBe('Nuclear Medicine');
      expect(MODALITY_LABELS.MG).toBe('Mammography');
      expect(MODALITY_LABELS.FL).toBe('Fluoroscopy');
      expect(MODALITY_LABELS.OTHER).toBe('Other');
    });
  });

  describe('BODY_REGION_LABELS', () => {
    it('contains all body regions', () => {
      const regions: ImagingBodyRegion[] = [
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
      ];
      regions.forEach((region) => {
        expect(BODY_REGION_LABELS[region]).toBeDefined();
        expect(typeof BODY_REGION_LABELS[region]).toBe('string');
      });
    });

    it('has correct labels', () => {
      expect(BODY_REGION_LABELS.HEAD).toBe('Head/Brain');
      expect(BODY_REGION_LABELS.CHEST).toBe('Chest');
      expect(BODY_REGION_LABELS.UPPER_EXTREMITY).toBe('Upper Extremity');
      expect(BODY_REGION_LABELS.WHOLE_BODY).toBe('Whole Body');
    });
  });

  describe('STATUS_LABELS', () => {
    it('contains all statuses', () => {
      const statuses: ImagingOrderStatus[] = [
        'DRAFT',
        'ORDERED',
        'SCHEDULED',
        'IN_PROGRESS',
        'COMPLETED',
        'REPORTED',
        'CANCELLED',
      ];
      statuses.forEach((status) => {
        expect(STATUS_LABELS[status]).toBeDefined();
        expect(typeof STATUS_LABELS[status]).toBe('string');
      });
    });

    it('has correct labels', () => {
      expect(STATUS_LABELS.DRAFT).toBe('Draft');
      expect(STATUS_LABELS.ORDERED).toBe('Ordered');
      expect(STATUS_LABELS.IN_PROGRESS).toBe('In Progress');
      expect(STATUS_LABELS.COMPLETED).toBe('Pending Report');
      expect(STATUS_LABELS.REPORTED).toBe('Reported');
      expect(STATUS_LABELS.CANCELLED).toBe('Cancelled');
    });
  });

  describe('PRIORITY_LABELS', () => {
    it('contains all priorities', () => {
      const priorities: ImagingPriority[] = ['ROUTINE', 'URGENT', 'STAT'];
      priorities.forEach((priority) => {
        expect(PRIORITY_LABELS[priority]).toBeDefined();
        expect(typeof PRIORITY_LABELS[priority]).toBe('string');
      });
    });

    it('has correct labels', () => {
      expect(PRIORITY_LABELS.ROUTINE).toBe('Routine');
      expect(PRIORITY_LABELS.URGENT).toBe('Urgent');
      expect(PRIORITY_LABELS.STAT).toBe('STAT (Immediate)');
    });
  });

  describe('LATERALITY_LABELS', () => {
    it('contains all lateralities', () => {
      const lateralities: Laterality[] = ['NA', 'LEFT', 'RIGHT', 'BILATERAL'];
      lateralities.forEach((lat) => {
        expect(LATERALITY_LABELS[lat]).toBeDefined();
        expect(typeof LATERALITY_LABELS[lat]).toBe('string');
      });
    });

    it('has correct labels', () => {
      expect(LATERALITY_LABELS.NA).toBe('Not Applicable');
      expect(LATERALITY_LABELS.LEFT).toBe('Left');
      expect(LATERALITY_LABELS.RIGHT).toBe('Right');
      expect(LATERALITY_LABELS.BILATERAL).toBe('Bilateral');
    });
  });
});
