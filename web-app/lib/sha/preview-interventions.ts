import { isPreviewInterventionInactiveStatus } from '@/lib/sha/missing-docs';

export interface PreviewActiveIntervention {
  intervention_code: string;
  intervention_name?: string;
  access_point?: 'IP' | 'OP' | 'BOTH';
  is_per_diem?: boolean;
}

export function extractPreviewActiveInterventions(payload: unknown): {
  available: boolean;
  interventions: PreviewActiveIntervention[];
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { available: false, interventions: [] };
  }
  const interventionsRaw = (payload as { interventions?: unknown }).interventions;
  if (!Array.isArray(interventionsRaw)) {
    return { available: false, interventions: [] };
  }

  const interventions = interventionsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const interventionCode = String(row.intervention_code || '').trim();
      if (!interventionCode) return null;

      const rawStatus = row.status || row.intervention_status;
      if (isPreviewInterventionInactiveStatus(rawStatus)) {
        return null;
      }

      const rawAccessPoint = String(row.access_point || row.intervention_access_point || '')
        .trim()
        .toUpperCase();
      let accessPoint: PreviewActiveIntervention['access_point'];
      if (rawAccessPoint === 'IP' || rawAccessPoint === 'OP' || rawAccessPoint === 'BOTH') {
        accessPoint = rawAccessPoint;
      } else if (rawAccessPoint.includes('IP') && rawAccessPoint.includes('OP')) {
        accessPoint = 'BOTH';
      }

      const interventionName = String(
        row.intervention_name || row.name || row.intervention_description || '',
      ).trim();

      const paymentMechanism = String(
        row.intervention_payment_mechanism || row.payment_mechanism || '',
      )
        .trim()
        .toUpperCase();

      return {
        intervention_code: interventionCode,
        intervention_name: interventionName || interventionCode,
        access_point: accessPoint,
        is_per_diem:
          row.is_per_diem === true
          || row.is_per_diem === 'true'
          || paymentMechanism.includes('PER DIEM'),
      };
    })
    .filter((row): row is PreviewActiveIntervention => !!row);

  return { available: true, interventions };
}
