import axios from 'axios';
import { SERVER_ORIGIN } from '../env';

// In development SERVER_ORIGIN is empty → Vite proxy rewrites /api/* → localhost:5000/api/*.
const BASE_URL = SERVER_ORIGIN ? `${SERVER_ORIGIN}/api` : '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data || err);
  }
);

export default api;

export const authApi = {
  login:    (data: unknown): Promise<any> => api.post('/auth/login', data),
  register: (data: unknown): Promise<any> => api.post('/auth/register', data),
  me:       (): Promise<any>              => api.get('/auth/me'),
  impersonate:       (userId: number): Promise<any> => api.post(`/auth/impersonate/${userId}`),
  getImpersonations: (): Promise<any>               => api.get('/auth/impersonations'),
  mfaLogin:      (data: { mfaToken: string; code: string }): Promise<any> => api.post('/auth/mfa/login', data),
  mfaSetup:      (): Promise<any>                     => api.post('/auth/mfa/setup'),
  mfaVerifySetup: (code: string): Promise<any>        => api.post('/auth/mfa/verify-setup', { code }),
  mfaDisable:    (code: string): Promise<any>         => api.post('/auth/mfa/disable', { code }),
};

export const medicineApi = {
  getAll: (params?: unknown): Promise<any>          => api.get('/medicines', { params }),
  getOne: (id: number): Promise<any>                => api.get(`/medicines/${id}`),
  create: (data: unknown): Promise<any>             => api.post('/medicines', data),
  update: (id: number, data: unknown): Promise<any> => api.put(`/medicines/${id}`, data),
  remove: (id: number): Promise<any>                => api.delete(`/medicines/${id}`),
};

export const supplierApi = {
  getAll: (): Promise<any>                           => api.get('/suppliers'),
  getOne: (id: number): Promise<any>                 => api.get(`/suppliers/${id}`),
  create: (data: unknown): Promise<any>              => api.post('/suppliers', data),
  update: (id: number, data: unknown): Promise<any>  => api.put(`/suppliers/${id}`, data),
  remove: (id: number): Promise<any>                 => api.delete(`/suppliers/${id}`),
};

export const orderApi = {
  getAll:  (): Promise<any>              => api.get('/orders'),
  getOne:  (id: number): Promise<any>    => api.get(`/orders/${id}`),
  create:  (data: unknown): Promise<any> => api.post('/orders', data),
  receive: (id: number): Promise<any>    => api.patch(`/orders/${id}/receive`),
};

export const saleApi = {
  getAll:     (): Promise<any>              => api.get('/sales'),
  getOne:     (id: number): Promise<any>    => api.get(`/sales/${id}`),
  create:     (data: unknown): Promise<any> => api.post('/sales', data),
  analytics:  (): Promise<any>              => api.get('/sales/analytics'),
};

export const inventoryApi = {
  summary:  (): Promise<any>             => api.get('/inventory/summary'),
  lowStock: (): Promise<any>             => api.get('/inventory/low-stock'),
  expiring: (days: number): Promise<any> => api.get('/inventory/expiring', { params: { days } }),
};

export const consultationApi = {
  getAll:           (): Promise<any>                               => api.get('/consultations'),
  getOne:           (id: number): Promise<any>                     => api.get(`/consultations/${id}`),
  create:           (formData: FormData): Promise<any>             => api.post('/consultations', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:           (id: number, formData: FormData): Promise<any> => api.put(`/consultations/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove:           (id: number): Promise<any>                     => api.delete(`/consultations/${id}`),
  updateByPatient:  (id: number, data: unknown): Promise<any>      => api.put(`/consultations/${id}/patient`, data),
  getPatientHistory:(patientId: number): Promise<any>              => api.get(`/consultations/patient/${patientId}/history`),
};

// A prescription can be sent to several pharmacies at once, each independently
// cancellable/re-sendable — see server/controllers/prescriptionAssignmentController.ts.
export const prescriptionAssignmentApi = {
  getAll:        (): Promise<any>                                    => api.get('/prescription-assignments'),
  getForConsultation: (consultationId: number): Promise<any>         => api.get('/prescription-assignments', { params: { consultation_id: consultationId } }),
  assign:        (consultation_id: number, pharmacist_id: number): Promise<any> => api.post('/prescription-assignments', { consultation_id, pharmacist_id }),
  updateStatus:  (id: number, status: string): Promise<any>          => api.patch(`/prescription-assignments/${id}/status`, { status }),
  cancel:        (id: number): Promise<any>                          => api.patch(`/prescription-assignments/${id}/cancel`),
  getMessages:   (id: number): Promise<any>                          => api.get(`/prescription-assignments/${id}/messages`),
  sendMessage:   (id: number, body: string): Promise<any>            => api.post(`/prescription-assignments/${id}/messages`, { body }),
};

export const labApi = {
  getAll:       (): Promise<any>                               => api.get('/lab-requests'),
  getOne:       (id: number): Promise<any>                     => api.get(`/lab-requests/${id}`),
  create:       (data: unknown): Promise<any>                  => data instanceof FormData
    ? api.post('/lab-requests', data, { headers: { 'Content-Type': 'multipart/form-data' } })
    : api.post('/lab-requests', data),
  createDirect: (formData: FormData): Promise<any>             => api.post('/lab-requests/direct', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadReport: (id: number, formData: FormData): Promise<any> => api.patch(`/lab-requests/${id}/report`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateStatus: (id: number, status: string, extra?: Record<string, unknown>): Promise<any> => api.patch(`/lab-requests/${id}/status`, { status, ...extra }),
  reject:       (id: number, message: string): Promise<any>    => api.patch(`/lab-requests/${id}/reject`, { message }),
  setPrice:     (id: number, data: { amount?: number; test_catalog_id?: number }): Promise<any> => api.patch(`/lab-requests/${id}/price`, data),
  remove:       (id: number): Promise<any>                     => api.delete(`/lab-requests/${id}`),
  getMessages:  (id: number): Promise<any>                     => api.get(`/lab-requests/${id}/messages`),
  sendMessage:  (id: number, body: string): Promise<any>       => api.post(`/lab-requests/${id}/messages`, { body }),
};

export const labCatalogApi = {
  getMine:      (): Promise<any>                     => api.get('/lab-catalog'),
  getForLab:    (laboratoryId: number): Promise<any> => api.get(`/lab-catalog/lab/${laboratoryId}`),
  create:       (data: unknown): Promise<any>        => api.post('/lab-catalog', data),
  update:       (id: number, data: unknown): Promise<any> => api.put(`/lab-catalog/${id}`, data),
  toggleActive: (id: number): Promise<any>           => api.patch(`/lab-catalog/${id}/toggle`),
};

export const labViewRequestApi = {
  getAll:     (): Promise<any>                           => api.get('/lab-view-requests'),
  create:     (data: unknown): Promise<any>              => api.post('/lab-view-requests', data),
  respond:    (id: number, status: string): Promise<any> => api.patch(`/lab-view-requests/${id}/respond`, { status }),
  getFileUrl: (id: number): string                       => `${api.defaults.baseURL || '/api'}/lab-view-requests/${id}/file`,
};

export const accessRequestApi = {
  getAll:           (): Promise<any>                                              => api.get('/access-requests'),
  create:           (data: unknown): Promise<any>                                 => api.post('/access-requests', data),
  respond:          (id: number, status: string): Promise<any>                    => api.patch(`/access-requests/${id}/respond`, { status }),
  searchPatients:   (q: string): Promise<any>                                     => api.get('/access-requests/search-patients', { params: { q } }),
  getPatientView:   (patientId: number): Promise<any>                             => api.get(`/access-requests/patient/${patientId}/view`),
  getLabReportFile: (patientId: number, labRequestId: number): Promise<Blob>      => api.get(`/access-requests/patient/${patientId}/lab-report/${labRequestId}/file`, { responseType: 'blob' }),
};

export const appointmentApi = {
  getAll:               (): Promise<any>                                            => api.get('/appointments'),
  create:               (data: unknown): Promise<any>                               => api.post('/appointments', data),
  updateStatus:         (id: number, status: string, extra?: Record<string, unknown>): Promise<any> => api.patch(`/appointments/${id}/status`, { status, ...extra }),
  getDoctorSlots:       (doctorId: number, days = 14, organizationId?: number | null): Promise<any> => api.get(`/appointments/doctor/${doctorId}/slots`, { params: { days, organization_id: organizationId ?? undefined } }),
  getWeeklyAvailability: (): Promise<any>                                           => api.get('/appointments/availability/weekly'),
  setWeeklyAvailability: (schedule: unknown, organizationId: number | null): Promise<any> => api.put('/appointments/availability/weekly', { schedule, organization_id: organizationId }),
  getOverrides:         (from?: string, to?: string): Promise<any>                  => api.get('/appointments/availability/overrides', { params: { from, to } }),
  setOverride:          (data: unknown): Promise<any>                               => api.post('/appointments/availability/overrides', data),
  deleteOverride:       (id: number): Promise<any>                                  => api.delete(`/appointments/availability/overrides/${id}`),
};

export const patientReportApi = {
  getAll:        (): Promise<any>                   => api.get('/patient-reports'),
  getOne:        (id: number): Promise<any>         => api.get(`/patient-reports/${id}`),
  create:        (formData: FormData): Promise<any> => api.post('/patient-reports', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove:        (id: number): Promise<any>         => api.delete(`/patient-reports/${id}`),
  getFile:       (id: number): Promise<any>         => api.get(`/patient-reports/${id}/file`, { responseType: 'blob' }),
  getDoctorFile: (id: number): Promise<any>         => api.get(`/patient-reports/${id}/doctor-file`, { responseType: 'blob' }),
};

export const notificationApi = {
  getAll:      (): Promise<any>            => api.get('/notifications'),
  markRead:    (id: number): Promise<any>  => api.patch(`/notifications/${id}/read`),
  markAllRead: (): Promise<any>            => api.patch('/notifications/read-all'),
};

export const patientVitalsApi = {
  get:         (): Promise<any>              => api.get('/patient-vitals'),
  history:     (): Promise<any>             => api.get('/patient-vitals/history'),
  fieldHistory: (field: string): Promise<any> => api.get(`/patient-vitals/history/${field}`),
  save:        (data: unknown): Promise<any> => api.post('/patient-vitals', data),
};

export const orgApi = {
  getAll:       (): Promise<any>                                      => api.get('/organizations'),
  provision:    (data: unknown): Promise<any>                        => api.post('/organizations', data),
  register:     (data: unknown): Promise<any>                        => api.post('/organizations/register', data),
  searchOwner:  (org_type: string, q: string): Promise<any>          => api.get('/organizations/search-owner', { params: { org_type, q } }),
  searchHospitalsClinics: (q: string): Promise<any>                  => api.get('/organizations/search-hospitals-clinics', { params: { q } }),
  getMembers:   (id: number): Promise<any>                          => api.get(`/organizations/${id}/members`),
  addMember:    (id: number, data: unknown): Promise<any>           => api.post(`/organizations/${id}/members`, data),
  removeMember: (id: number, userId: number): Promise<any>          => api.delete(`/organizations/${id}/members/${userId}`),
  toggle:       (id: number): Promise<any>                          => api.patch(`/organizations/${id}/toggle`),
};

// Org-owner-managed team logins — distinct from the admin-only orgApi.addMember
// (which only attaches an EXISTING user); this creates a brand-new login.
export const orgTeamApi = {
  getMembers: (orgId: number): Promise<any>                    => api.get(`/org-team/${orgId}/members`),
  invite:     (orgId: number, data: unknown): Promise<any>     => api.post(`/org-team/${orgId}/members`, data),
  remove:     (orgId: number, userId: number): Promise<any>    => api.delete(`/org-team/${orgId}/members/${userId}`),
};

export const userApi = {
  getAll:              (params?: unknown): Promise<any>          => api.get('/users', { params }),
  searchPatients:      (q: string): Promise<any>                 => api.get('/users/patients', { params: { q } }),
  searchPharmacists:   (q: string): Promise<any>                 => api.get('/users/pharmacists', { params: { q } }),
  searchLaboratories:  (q: string): Promise<any>                 => api.get('/users/laboratories', { params: { q } }),
  searchDoctors:       (q: string): Promise<any>                 => api.get('/users/doctors', { params: { q } }),
  getOne:              (id: number): Promise<any>                => api.get(`/users/${id}`),
  getProfile:          (id: number): Promise<any>                => api.get(`/users/${id}/profile`),
  update:              (id: number, data: unknown): Promise<any> => api.put(`/users/${id}`, data),
  updateProfile:       (id: number, data: unknown): Promise<any> => api.put(`/users/${id}/profile`, data),
  updateMyProfile:     (data: unknown): Promise<any>              => api.put('/users/me/profile', data),
  getMyOrganizations:  (): Promise<any>                          => api.get('/users/me/organizations'),
  joinOrganization:    (organizationId: number): Promise<any>    => api.post('/users/me/organizations', { organization_id: organizationId }),
  leaveOrganization:   (organizationId: number): Promise<any>    => api.delete(`/users/me/organizations/${organizationId}`),
  toggle:              (id: number): Promise<any>                => api.patch(`/users/${id}/toggle`),
  remove:              (id: number): Promise<any>                => api.delete(`/users/${id}`),
  getStats:            (): Promise<any>                          => api.get('/users/stats'),
};
