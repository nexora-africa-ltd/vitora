/**
 * Document Generation System - Type Definitions
 *
 * Defines the schema for document definitions that map clinical data
 * to renderable HTML templates for prescriptions, labels, invoices, etc.
 *
 * @see .tmp/document-generation-plan.md for full architecture
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Supported document types in the system
 */
export type DocumentType = 'prescription' | 'label' | 'invoice' | 'receipt';

/**
 * Layout variants for different output formats
 */
export type LayoutType = 'a4' | 'label' | 'thermal-58mm' | 'thermal-80mm';

/**
 * Asset types that can be embedded in documents
 */
export type AssetType = 'qr' | 'barcode' | 'logo';

// =============================================================================
// DOCUMENT DEFINITION SCHEMA
// =============================================================================

/**
 * Defines how a repeating section (e.g., table rows) should be populated
 */
export interface Repeater {
  /** CSS selector for the template row to repeat */
  selector: string;
  /** Data path to the array source (e.g., "prescription.items") */
  source: string;
  /** Field mappings: template placeholder → data path */
  fields: Record<string, string>;
}

/**
 * Defines an embedded asset (QR code, barcode, logo)
 */
export interface AssetDefinition {
  /** Type of asset to generate */
  type: AssetType;
  /** Data path for the asset content (e.g., "prescription.prescription_number") */
  source: string;
  /** CSS selector where the asset should be placed */
  placement: string;
  /** Optional width in pixels */
  width?: number;
  /** Optional height in pixels */
  height?: number;
}

/**
 * Complete document definition schema
 *
 * This is the JSON contract between clinical data and renderable documents.
 * Each document type (prescription, label, etc.) has one definition.
 */
export interface DocumentDefinition {
  /** Type of document */
  document_type: DocumentType;
  /** Schema version for future migrations */
  version: string;
  /** Default layout format */
  layout: LayoutType;
  /** Reference to HTML template (for documentation) */
  template: string;
  /**
   * Maps logical data sources to actual data paths
   * e.g., { "patient": "encounter.patient", "medications": "prescription.items" }
   */
  data_sources: Record<string, string>;
  /**
   * Simple variable bindings: template placeholder → data path
   * e.g., { "{{patient.full_name}}": "patient.name" }
   */
  bindings: Record<string, string>;
  /** Repeating sections (tables, lists) */
  repeaters?: Repeater[];
  /** Embedded assets (QR codes, barcodes, logos) */
  assets?: Record<string, AssetDefinition>;
}

// =============================================================================
// PRINT OPTIONS
// =============================================================================

/**
 * Options for customizing document rendering
 */
export interface PrintOptions {
  /** Override the default layout */
  layout?: LayoutType;
  /** Theme name (e.g., "default", "facility-private") */
  theme?: string;
  /** Facility ID for facility-specific theming */
  facilityId?: string;
  /** Whether to show print preview (default: true) */
  showPreview?: boolean;
}

// =============================================================================
// FACILITY INFO (for document headers)
// =============================================================================

/**
 * Facility information for document headers
 */
export interface FacilityInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  license?: string;
  logo_url?: string;
  theme?: string;
}

/**
 * Clinician information for signatures
 */
export interface ClinicianInfo {
  name: string;
  registration_number?: string;
  specialization?: string;
  signature_url?: string;
}

/**
 * Patient information for documents
 */
export interface PatientInfo {
  full_name: string;
  mrn?: string;
  age?: number | string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
}

// =============================================================================
// RENDER CONTEXT
// =============================================================================

/**
 * Complete context passed to the renderer
 */
export interface RenderContext {
  /** Patient information */
  patient?: PatientInfo;
  /** Facility information */
  facility?: FacilityInfo;
  /** Clinician information */
  clinician?: ClinicianInfo;
  /** Encounter ID */
  encounter_id?: number | string;
  /** System name for footer */
  system_name?: string;
  /** Any additional data */
  [key: string]: unknown;
}

// =============================================================================
// PRINT UTILITY OPTION TYPES
// =============================================================================

/**
 * Options for printing prescriptions
 */
export interface PrintPrescriptionData {
  prescription_number: string;
  prescribed_date: string;
  clinical_notes?: string;
  items: Array<{
    drug_name?: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
    quantity_prescribed: number;
  }>;
}

/**
 * Options for printing labels
 */
export interface PrintLabelData {
  drug_name?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  batch_number?: string;
  expiry_date?: string;
  dispensed_at: string;
  quantity: number;
}

// =============================================================================
// CSS INJECTION
// =============================================================================

/**
 * CSS files to inject based on layout and theme
 */
export interface CSSConfig {
  /** Base CSS (reset, typography) */
  base: string[];
  /** Layout-specific CSS */
  layout: string;
  /** Theme CSS */
  theme: string;
  /** Printer-specific CSS (optional) */
  printer?: string;
}

/**
 * Get CSS configuration for a layout type
 */
export function getCSSConfig(layout: LayoutType, theme: string = 'default'): CSSConfig {
  const baseCSS = ['reset.css', 'typography.css'];

  const layoutMap: Record<LayoutType, string> = {
    a4: 'layout-a4.css',
    label: 'layout-label.css',
    'thermal-58mm': 'layout-label.css',
    'thermal-80mm': 'layout-label.css',
  };

  const printerMap: Record<LayoutType, string | undefined> = {
    a4: undefined,
    label: undefined,
    'thermal-58mm': 'thermal-58mm.css',
    'thermal-80mm': 'thermal-80mm.css',
  };

  return {
    base: baseCSS,
    layout: layoutMap[layout],
    theme: `${theme}.css`,
    printer: printerMap[layout],
  };
}
