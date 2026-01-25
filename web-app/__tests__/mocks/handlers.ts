import { http, HttpResponse } from 'msw';
import {
  mockPatients,
  mockEncounters,
  mockCounties,
  mockSubCounties,
  mockWards,
  mockUser,
  mockTokens,
  mockICD10Codes,
} from './data';
import {
  mockInpatientWards,
  mockBeds,
  mockAdmissionRecommendations,
  mockAdmissions,
} from './inpatient-data';
import {
  mockDrugs,
  mockStockBatches,
  mockStockAlerts,
  mockPrescriptions,
} from './pharmacy-data';

const API_BASE = 'http://127.0.0.1:9088';

export const handlers = [
  // ===================
  // Auth endpoints
  // ===================
  http.post(`${API_BASE}/api/token/`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };

    if (body.username === 'testuser' && body.password === 'password123') {
      return HttpResponse.json({
        access: mockTokens.access,
        refresh: mockTokens.refresh,
        user: mockUser,
      });
    }

    return HttpResponse.json(
      { detail: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  http.post(`${API_BASE}/api/token/refresh/`, async ({ request }) => {
    const body = (await request.json()) as { refresh: string };

    if (body.refresh === mockTokens.refresh) {
      return HttpResponse.json({
        access: 'new-mock-access-token-12345',
      });
    }

    return HttpResponse.json(
      { detail: 'Token is invalid or expired' },
      { status: 401 }
    );
  }),

  http.post(`${API_BASE}/api/token/verify/`, async ({ request }) => {
    const body = (await request.json()) as { token: string };

    if (body.token === mockTokens.access) {
      return HttpResponse.json({});
    }

    return HttpResponse.json(
      { detail: 'Token is invalid or expired' },
      { status: 401 }
    );
  }),

  // ===================
  // Patients endpoints
  // ===================
  http.get(`${API_BASE}/api/patients/`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let filteredPatients = [...mockPatients];

    if (search) {
      const searchLower = search.toLowerCase();
      filteredPatients = filteredPatients.filter(
        (p) =>
          p.first_name.toLowerCase().includes(searchLower) ||
          p.last_name.toLowerCase().includes(searchLower) ||
          p.mrn.toLowerCase().includes(searchLower)
      );
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedPatients = filteredPatients.slice(start, end);

    return HttpResponse.json({
      count: filteredPatients.length,
      next: end < filteredPatients.length ? `${API_BASE}/api/patients/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/patients/?page=${page - 1}` : null,
      results: paginatedPatients,
    });
  }),

  http.get(`${API_BASE}/api/patients/:id/`, ({ params }) => {
    const id = Number(params.id);
    const patient = mockPatients.find((p) => p.id === id);

    if (patient) {
      return HttpResponse.json(patient);
    }

    return HttpResponse.json(
      { detail: 'Not found.' },
      { status: 404 }
    );
  }),

  http.post(`${API_BASE}/api/patients/`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newPatient = {
      id: mockPatients.length + 1,
      mrn: `MRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(mockPatients.length + 1).padStart(4, '0')}`,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json(newPatient, { status: 201 });
  }),

  http.patch(`${API_BASE}/api/patients/:id/`, async ({ params, request }) => {
    const id = Number(params.id);
    const patient = mockPatients.find((p) => p.id === id);
    const body = await request.json() as Record<string, unknown>;

    if (patient) {
      const updatedPatient = {
        ...patient,
        ...body,
        updated_at: new Date().toISOString(),
      };
      return HttpResponse.json(updatedPatient);
    }

    return HttpResponse.json(
      { detail: 'Not found.' },
      { status: 404 }
    );
  }),

  http.delete(`${API_BASE}/api/patients/:id/`, ({ params }) => {
    const id = Number(params.id);
    const patient = mockPatients.find((p) => p.id === id);

    if (patient) {
      return new HttpResponse(null, { status: 204 });
    }

    return HttpResponse.json(
      { detail: 'Not found.' },
      { status: 404 }
    );
  }),

  // ===================
  // Encounters endpoints
  // ===================
  http.get(`${API_BASE}/api/encounters/`, ({ request }) => {
    const url = new URL(request.url);
    const patientId = url.searchParams.get('patient');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let filteredEncounters = [...mockEncounters];

    if (patientId) {
      filteredEncounters = filteredEncounters.filter(
        (e) => e.patient === Number(patientId)
      );
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedEncounters = filteredEncounters.slice(start, end);

    return HttpResponse.json({
      count: filteredEncounters.length,
      next: end < filteredEncounters.length ? `${API_BASE}/api/encounters/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/encounters/?page=${page - 1}` : null,
      results: paginatedEncounters,
    });
  }),

  http.get(`${API_BASE}/api/encounters/:id/`, ({ params }) => {
    const id = Number(params.id);
    const encounter = mockEncounters.find((e) => e.id === id);

    if (encounter) {
      return HttpResponse.json(encounter);
    }

    return HttpResponse.json(
      { detail: 'Not found.' },
      { status: 404 }
    );
  }),

  http.post(`${API_BASE}/api/encounters/`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newEncounter = {
      id: mockEncounters.length + 1,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json(newEncounter, { status: 201 });
  }),

  http.patch(`${API_BASE}/api/encounters/:id/`, async ({ params, request }) => {
    const id = Number(params.id);
    const encounter = mockEncounters.find((e) => e.id === id);
    const body = await request.json() as Record<string, unknown>;

    if (encounter) {
      const updatedEncounter = {
        ...encounter,
        ...body,
        updated_at: new Date().toISOString(),
      };
      return HttpResponse.json(updatedEncounter);
    }

    return HttpResponse.json(
      { detail: 'Not found.' },
      { status: 404 }
    );
  }),

  // ===================
  // Triage endpoints
  // ===================
  http.get(`${API_BASE}/api/triage/vital-thresholds/`, () => {
    // Minimal threshold set used by vitals components/hooks.
    // Matches the structure expected by `useVitalThresholds`.
    return HttpResponse.json([
      {
        id: 1,
        vital_type: 'SPO2',
        critical_low: 90,
        warning_low: 95,
        warning_high: null,
        critical_high: null,
        unit: '%',
        description: 'Oxygen saturation',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        vital_type: 'SYSTOLIC_BP',
        critical_low: 90,
        warning_low: 100,
        warning_high: 140,
        critical_high: 180,
        unit: 'mmHg',
        description: 'Systolic blood pressure',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 3,
        vital_type: 'DIASTOLIC_BP',
        critical_low: 60,
        warning_low: 70,
        warning_high: 90,
        critical_high: 120,
        unit: 'mmHg',
        description: 'Diastolic blood pressure',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 4,
        vital_type: 'TEMPERATURE',
        critical_low: 35,
        warning_low: 36.5,
        warning_high: 37.5,
        critical_high: 39,
        unit: '°C',
        description: 'Body temperature',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 5,
        vital_type: 'HEART_RATE',
        critical_low: 40,
        warning_low: 50,
        warning_high: 100,
        critical_high: 130,
        unit: 'bpm',
        description: 'Heart rate',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 6,
        vital_type: 'RESPIRATORY_RATE',
        critical_low: 8,
        warning_low: 12,
        warning_high: 20,
        critical_high: 30,
        unit: '/min',
        description: 'Respiratory rate',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
  }),

  // ===================
  // Inpatient endpoints
  // ===================
  http.get(`${API_BASE}/api/inpatient/wards/`, ({ request }) => {
    const url = new URL(request.url);
    const wardType = url.searchParams.get('ward_type');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let wards = [...mockInpatientWards];
    if (wardType) {
      wards = wards.filter((w) => w.ward_type === wardType);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedWards = wards.slice(start, end);

    return HttpResponse.json({
      count: wards.length,
      next: end < wards.length ? `${API_BASE}/api/inpatient/wards/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/inpatient/wards/?page=${page - 1}` : null,
      results: paginatedWards,
    });
  }),

  http.get(`${API_BASE}/api/inpatient/wards/:id/`, ({ params }) => {
    const id = Number(params.id);
    const ward = mockInpatientWards.find((w: { id: number }) => w.id === id);
    if (!ward) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json(ward);
  }),

  http.get(`${API_BASE}/api/inpatient/wards/:id/beds/`, ({ params, request }) => {
    const wardId = Number(params.id);
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let beds = mockBeds.filter((b) => b.ward === wardId);
    if (statusFilter) {
      beds = beds.filter((b) => b.status === statusFilter);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedBeds = beds.slice(start, end);

    // Return paginated shape to match DRF pagination behavior
    return HttpResponse.json({
      count: beds.length,
      next: end < beds.length ? `${API_BASE}/api/inpatient/wards/${wardId}/beds/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/inpatient/wards/${wardId}/beds/?page=${page - 1}` : null,
      results: paginatedBeds,
    });
  }),

  http.get(`${API_BASE}/api/inpatient/beds/`, ({ request }) => {
    const url = new URL(request.url);
    const ward = url.searchParams.get('ward');
    const statusFilter = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let beds = [...mockBeds];
    if (ward) beds = beds.filter((b) => b.ward === Number(ward));
    if (statusFilter) beds = beds.filter((b) => b.status === statusFilter);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedBeds = beds.slice(start, end);

    return HttpResponse.json({
      count: beds.length,
      next: end < beds.length ? `${API_BASE}/api/inpatient/beds/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/inpatient/beds/?page=${page - 1}` : null,
      results: paginatedBeds,
    });
  }),

  http.get(`${API_BASE}/api/inpatient/beds/:id/`, ({ params }) => {
    const id = Number(params.id);
    const bed = mockBeds.find((b) => b.id === id);
    if (!bed) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json(bed);
  }),

  http.patch(`${API_BASE}/api/inpatient/beds/:id/`, async ({ params, request }) => {
    const id = Number(params.id);
    const bed = mockBeds.find((b) => b.id === id);
    if (!bed) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updated = {
      ...bed,
      ...body,
    };
    return HttpResponse.json(updated);
  }),

  http.get(`${API_BASE}/api/inpatient/admission-recommendations/`, ({ request }) => {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const urgency = url.searchParams.get('urgency');
    const ordering = url.searchParams.get('ordering');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let recs = [...mockAdmissionRecommendations];
    if (statusFilter) recs = recs.filter((r) => r.status === statusFilter);
    if (urgency) recs = recs.filter((r) => r.urgency === urgency);
    if (ordering === '-created_at') recs = recs.reverse();

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = recs.slice(start, end);

    return HttpResponse.json({
      count: recs.length,
      next: end < recs.length ? `${API_BASE}/api/inpatient/admission-recommendations/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/inpatient/admission-recommendations/?page=${page - 1}` : null,
      results: paginated,
    });
  }),

  http.get(`${API_BASE}/api/inpatient/admission-recommendations/:id/`, ({ params }) => {
    const id = Number(params.id);
    const rec = mockAdmissionRecommendations.find((r) => r.id === id);
    if (!rec) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json(rec);
  }),

  http.post(`${API_BASE}/api/inpatient/admission-recommendations/`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created = {
      id: mockAdmissionRecommendations.length + 1,
      status: 'PENDING',
      expires_at: '2026-01-04T09:00:00Z',
      is_expired: false,
      ...body,
    };
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post(`${API_BASE}/api/inpatient/admission-recommendations/:id/accept/`, async ({ params, request }) => {
    const id = Number(params.id);
    const rec = mockAdmissionRecommendations.find((r) => r.id === id);
    if (!rec) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = (await request.json()) as { user?: number };
    if (!body.user) {
      return HttpResponse.json({ error: 'User ID required' }, { status: 400 });
    }
    return HttpResponse.json({ ...rec, status: 'ACCEPTED' });
  }),

  http.post(`${API_BASE}/api/inpatient/admission-recommendations/:id/decline/`, async ({ params, request }) => {
    const id = Number(params.id);
    const rec = mockAdmissionRecommendations.find((r) => r.id === id);
    if (!rec) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = (await request.json()) as { user?: number; reason?: string };
    if (!body.user || !body.reason) {
      return HttpResponse.json({ error: 'User ID and reason required' }, { status: 400 });
    }
    return HttpResponse.json({ ...rec, status: 'DECLINED' });
  }),

  http.get(`${API_BASE}/api/inpatient/admissions/`, ({ request }) => {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('admission_status');
    const patient = url.searchParams.get('patient');
    const ward = url.searchParams.get('ward');
    const payerType = url.searchParams.get('payer_type');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');

    let admissions = [...mockAdmissions];
    if (statusFilter) admissions = admissions.filter((a) => a.admission_status === statusFilter);
    if (patient) admissions = admissions.filter((a) => a.patient === Number(patient));
    if (ward) admissions = admissions.filter((a) => a.ward === Number(ward));
    if (payerType) admissions = admissions.filter((a) => a.payer_type === payerType);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = admissions.slice(start, end);

    return HttpResponse.json({
      count: admissions.length,
      next: end < admissions.length ? `${API_BASE}/api/inpatient/admissions/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/inpatient/admissions/?page=${page - 1}` : null,
      results: paginated,
    });
  }),

  http.get(`${API_BASE}/api/inpatient/admissions/:id/`, ({ params }) => {
    const id = Number(params.id);
    const admission = mockAdmissions.find((a) => a.id === id);
    if (!admission) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json(admission);
  }),

  http.post(`${API_BASE}/api/inpatient/admissions/`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created = {
      id: mockAdmissions.length + 1,
      admission_number: `ADM-20260103-${String(mockAdmissions.length + 1).padStart(4, '0')}`,
      admission_status: 'ACTIVE',
      ...body,
    };
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch(`${API_BASE}/api/inpatient/admissions/:id/`, async ({ params, request }) => {
    const id = Number(params.id);
    const admission = mockAdmissions.find((a) => a.id === id);
    if (!admission) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updated = {
      ...admission,
      ...body,
    };
    return HttpResponse.json(updated);
  }),

  // ===================
  // Locations endpoints
  // ===================
  http.get(`${API_BASE}/api/locations/counties/`, () => {
    return HttpResponse.json(mockCounties);
  }),

  http.get(`${API_BASE}/api/locations/sub-counties/`, ({ request }) => {
    const url = new URL(request.url);
    const countyId = url.searchParams.get('county');

    if (countyId) {
      const filtered = mockSubCounties.filter(
        (sc) => sc.county === Number(countyId)
      );
      return HttpResponse.json(filtered);
    }

    return HttpResponse.json(mockSubCounties);
  }),

  http.get(`${API_BASE}/api/locations/wards/`, ({ request }) => {
    const url = new URL(request.url);
    const subCountyId = url.searchParams.get('sub_county');

    if (subCountyId) {
      const filtered = mockWards.filter(
        (w) => w.sub_county === Number(subCountyId)
      );
      return HttpResponse.json(filtered);
    }

    return HttpResponse.json(mockWards);
  }),

  // ===================
  // ICD-10 endpoints
  // ===================
  http.get(`${API_BASE}/api/icd10/`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');

    if (search) {
      const searchLower = search.toLowerCase();
      const filtered = mockICD10Codes.filter(
        (code) =>
          code.code.toLowerCase().includes(searchLower) ||
          code.description.toLowerCase().includes(searchLower)
      );
      return HttpResponse.json(filtered);
    }

    return HttpResponse.json(mockICD10Codes);
  }),

  // ===================
  // User/Me endpoint
  // ===================
  http.get(`${API_BASE}/api/users/me/`, () => {
    return HttpResponse.json(mockUser);
  }),

  // ===================
  // Pharmacy endpoints
  // ===================

  // Drugs
  http.get(`${API_BASE}/api/pharmacy/drugs/`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '20');

    let filteredDrugs = [...mockDrugs];

    if (search) {
      const searchLower = search.toLowerCase();
      filteredDrugs = filteredDrugs.filter(
        (d) =>
          d.generic_name.toLowerCase().includes(searchLower) ||
          d.code.toLowerCase().includes(searchLower) ||
          d.brand_names.some((b) => b.toLowerCase().includes(searchLower))
      );
    }

    if (category) {
      filteredDrugs = filteredDrugs.filter((d) => d.category === category);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedDrugs = filteredDrugs.slice(start, end);

    return HttpResponse.json({
      count: filteredDrugs.length,
      next: end < filteredDrugs.length ? `${API_BASE}/api/pharmacy/drugs/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/pharmacy/drugs/?page=${page - 1}` : null,
      results: paginatedDrugs,
    });
  }),

  http.get(`${API_BASE}/api/pharmacy/drugs/:id/`, ({ params }) => {
    const id = Number(params.id);
    const drug = mockDrugs.find((d) => d.id === id);

    if (drug) {
      return HttpResponse.json(drug);
    }

    return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
  }),

  // Stock batches
  http.get(`${API_BASE}/api/pharmacy/stock/`, ({ request }) => {
    const url = new URL(request.url);
    const drugId = url.searchParams.get('drug');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '20');

    let filteredBatches = [...mockStockBatches];

    if (drugId) {
      filteredBatches = filteredBatches.filter((b) => b.drug === Number(drugId));
    }

    if (status) {
      filteredBatches = filteredBatches.filter((b) => b.status === status);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedBatches = filteredBatches.slice(start, end);

    return HttpResponse.json({
      count: filteredBatches.length,
      next: end < filteredBatches.length ? `${API_BASE}/api/pharmacy/stock/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/pharmacy/stock/?page=${page - 1}` : null,
      results: paginatedBatches,
    });
  }),

  http.get(`${API_BASE}/api/pharmacy/stock/by_drug/`, ({ request }) => {
    const url = new URL(request.url);
    const drugId = url.searchParams.get('drug_id');

    if (!drugId) {
      return HttpResponse.json({ error: 'drug_id parameter is required' }, { status: 400 });
    }

    const batches = mockStockBatches.filter((b) => b.drug === Number(drugId));
    return HttpResponse.json(batches);
  }),

  // Stock alerts
  http.get(`${API_BASE}/api/pharmacy/alerts/`, ({ request }) => {
    const url = new URL(request.url);
    const resolved = url.searchParams.get('resolved');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '20');

    let filteredAlerts = [...mockStockAlerts];

    if (resolved !== null) {
      filteredAlerts = filteredAlerts.filter((a) => a.resolved === (resolved === 'true'));
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedAlerts = filteredAlerts.slice(start, end);

    return HttpResponse.json({
      count: filteredAlerts.length,
      next: end < filteredAlerts.length ? `${API_BASE}/api/pharmacy/alerts/?page=${page + 1}` : null,
      previous: page > 1 ? `${API_BASE}/api/pharmacy/alerts/?page=${page - 1}` : null,
      results: paginatedAlerts,
    });
  }),

  http.get(`${API_BASE}/api/pharmacy/alerts/low_stock/`, () => {
    const lowStockAlerts = mockStockAlerts.filter(
      (a) => (a.alert_type === 'LOW_STOCK' || a.alert_type === 'OUT_OF_STOCK') && !a.resolved
    );
    return HttpResponse.json(lowStockAlerts);
  }),

  http.get(`${API_BASE}/api/pharmacy/alerts/expiring/`, () => {
    const expiringAlerts = mockStockAlerts.filter(
      (a) =>
        (a.alert_type === 'EXPIRING_SOON' || a.alert_type === 'EXPIRING_CRITICAL' || a.alert_type === 'EXPIRED') &&
        !a.resolved
    );
    return HttpResponse.json(expiringAlerts);
  }),

  http.post(`${API_BASE}/api/pharmacy/alerts/:id/acknowledge/`, ({ params }) => {
    const id = Number(params.id);
    const alert = mockStockAlerts.find((a) => a.id === id);

    if (alert) {
      return HttpResponse.json({
        ...alert,
        acknowledged: true,
        acknowledged_by: 1,
        acknowledged_by_name: 'Admin User',
        acknowledged_at: new Date().toISOString(),
      });
    }

    return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
  }),

  http.post(`${API_BASE}/api/pharmacy/alerts/:id/resolve/`, async ({ params, request }) => {
    const id = Number(params.id);
    const alert = mockStockAlerts.find((a) => a.id === id);
    const body = (await request.json()) as { notes?: string };

    if (alert) {
      return HttpResponse.json({
        ...alert,
        resolved: true,
        resolved_by: 1,
        resolved_by_name: 'Admin User',
        resolved_at: new Date().toISOString(),
        resolution_notes: body.notes || '',
      });
    }

    return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
  }),

  // Prescriptions
  http.get(`${API_BASE}/api/pharmacy/prescriptions/`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '20');

    let filteredPrescriptions = [...mockPrescriptions];

    if (status) {
      filteredPrescriptions = filteredPrescriptions.filter((p) => p.status === status);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedPrescriptions = filteredPrescriptions.slice(start, end);

    return HttpResponse.json({
      count: filteredPrescriptions.length,
      next:
        end < filteredPrescriptions.length
          ? `${API_BASE}/api/pharmacy/prescriptions/?page=${page + 1}`
          : null,
      previous: page > 1 ? `${API_BASE}/api/pharmacy/prescriptions/?page=${page - 1}` : null,
      results: paginatedPrescriptions,
    });
  }),

  http.get(`${API_BASE}/api/pharmacy/prescriptions/:id/`, ({ params }) => {
    const id = Number(params.id);
    const prescription = mockPrescriptions.find((p) => p.id === id);

    if (prescription) {
      return HttpResponse.json(prescription);
    }

    return HttpResponse.json({ detail: 'Not found.' }, { status: 404 });
  }),

  // Reports
  http.get(`${API_BASE}/api/pharmacy/reports/stock-summary/`, () => {
    const summary = mockDrugs.map((drug) => ({
      drug_id: drug.id,
      drug_code: drug.code,
      drug_name: drug.generic_name,
      category: drug.category,
      form: drug.form,
      strength: drug.strength,
      total_stock: drug.current_stock,
      total_value: drug.current_stock * (drug.reference_price || 0),
      reorder_level: drug.default_reorder_level,
      status: drug.current_stock === 0 ? 'OUT_OF_STOCK' : drug.current_stock < drug.default_reorder_level ? 'LOW' : 'OK',
      batches_count: mockStockBatches.filter((b) => b.drug === drug.id && b.status === 'AVAILABLE').length,
      expiring_within_30_days: 0,
      expired_quantity: mockStockBatches
        .filter((b) => b.drug === drug.id && b.is_expired)
        .reduce((sum, b) => sum + b.quantity_expired, 0),
    }));
    return HttpResponse.json(summary);
  }),
];
