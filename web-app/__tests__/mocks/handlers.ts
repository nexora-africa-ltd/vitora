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
];
