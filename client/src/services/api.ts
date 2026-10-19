import axios from 'axios';
import { SERVER_ORIGIN } from '../env';

// In development SERVER_ORIGIN is empty → Vite proxy rewrites /api/* → localhost:5000/api/*.
const BASE_URL = SERVER_ORIGIN ? `${SERVER_ORIGIN}/api` : '/api';

// INF-05: no client-side timeout meant a request to a hung or unreachable
// server never settled — the spinner span and the user had no signal other
// than the page looking broken. 30s matches the server's own requestTimeout,
// so the two ends agree on when a request has failed. File uploads override
// this per call (see UPLOAD_TIMEOUT_MS) since OCR-bound requests legitimately
// take longer than an ordinary JSON round trip.
const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// SEC-17 (auth): access tokens are now short-lived (15m), so a 401 from an
// expired-but-otherwise-valid session is the common case, not the exception.
// One shared in-flight refresh call (not one per failed request) exchanges
// the stored refresh token for a new pair and retries; if that fails (no
// refresh token — e.g. an impersonation session, which never gets one on
// purpose — or it's been revoked/expired) this falls back to the original
// clear-and-redirect behavior.
let refreshPromise: Promise<string | null> | null = null;

const clearSessionAndRedirect = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

const doRefresh = async (): Promise<string | null> => {
  const storedRefresh = localStorage.getItem('refreshToken');
  if (!storedRefresh) return null;
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: storedRefresh });
    const { token, refreshToken } = res.data as { token: string; refreshToken: string };
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    return token;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const original = err.config;
    const url: string = original?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/mfa/login');

    if (err.response?.status === 401 && localStorage.getItem('token') && !isAuthEndpoint && !original._retry) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
      clearSessionAndRedirect();
    } else if (err.response?.status === 401 && localStorage.getItem('token') && !isAuthEndpoint) {
      clearSessionAndRedirect();
    }
    return Promise.reject(err.response?.data || err);
  }
);

export default api;

// The patient's own complete health report, assembled and audited server-side
// (MON-12) for the downloadable PDF. See utils/healthReportPdf.ts.
export const healthReportApi = {
  me: (): Promise<any> => api.get('/health-report/me'),
};

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
  refresh:       (refreshToken: string): Promise<any> => api.post('/auth/refresh', { refreshToken }),
  logoutSession: (refreshToken: string): Promise<any> => api.post('/auth/logout', { refreshToken }),
  changePassword: (data: { currentPassword: string; newPassword: string }): Promise<any> => api.post('/auth/change-password', data),
  forgotPassword: (email: string): Promise<any> => api.post('/auth/forgot-password', { email }),
  resetPassword:  (data: { token: string; newPassword: string }): Promise<any> => api.post('/auth/reset-password', data),
  // PRO-11: email verification
  verifyEmail:        (token: string): Promise<any> => api.post('/auth/verify-email', { token }),
  resendVerification: (email: string): Promise<any> => api.post('/auth/resend-verification', { email }),
  // COMP-02: re-acceptance of an updated Terms/Privacy version
  acceptTerms:        (version: string): Promise<any> => api.post('/auth/accept-terms', { version }),
};

// organization_id is only ever read server-side for an admin caller (see
// resolvePharmacySchema in server/config/db.ts) — a pharmacist's own org is
// always resolved from their membership regardless of what's sent here, so
// passing undefined for non-admin callers is the normal, correct case.
export const medicineApi = {
  getAll: (params?: unknown): Promise<any>                                     => api.get('/medicines', { params }),
  getOne: (id: number, organization_id?: number): Promise<any>                 => api.get(`/medicines/${id}`, { params: { organization_id } }),
  create: (data: unknown, organization_id?: number): Promise<any>              => api.post('/medicines', data, { params: { organization_id } }),
  update: (id: number, data: unknown, organization_id?: number): Promise<any>  => api.put(`/medicines/${id}`, data, { params: { organization_id } }),
  adjustStock: (id: number, delta: number, organization_id?: number): Promise<any> => api.patch(`/medicines/${id}/stock`, { delta }, { params: { organization_id } }),
  remove: (id: number, organization_id?: number): Promise<any>                => api.delete(`/medicines/${id}`, { params: { organization_id } }),
};

export const supplierApi = {
  getAll: (organization_id?: number): Promise<any>                        => api.get('/suppliers', { params: { organization_id } }),
  getOne: (id: number, organization_id?: number): Promise<any>            => api.get(`/suppliers/${id}`, { params: { organization_id } }),
  create: (data: unknown, organization_id?: number): Promise<any>         => api.post('/suppliers', data, { params: { organization_id } }),
  update: (id: number, data: unknown, organization_id?: number): Promise<any> => api.put(`/suppliers/${id}`, data, { params: { organization_id } }),
  remove: (id: number, organization_id?: number): Promise<any>            => api.delete(`/suppliers/${id}`, { params: { organization_id } }),
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
  summary:  (organization_id?: number): Promise<any>             => api.get('/inventory/summary', { params: { organization_id } }),
  lowStock: (organization_id?: number): Promise<any>             => api.get('/inventory/low-stock', { params: { organization_id } }),
  expiring: (days: number, organization_id?: number): Promise<any> => api.get('/inventory/expiring', { params: { days, organization_id } }),
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

// Requirement 1: a doctor picking a hospital to channel at no longer joins
// instantly — the owner has to approve it (and, the other direction, the
// owner removing a doctor needs the doctor to accept). See
// server/controllers/orgMembershipRequestController.ts.
export const orgMembershipRequestApi = {
  requestJoin: (organizationId: number, data?: { message?: string; proposed_schedule?: unknown[] }): Promise<any> =>
    api.post('/org-membership-requests/join', { organization_id: organizationId, ...data }),
  requestRemove: (organizationId: number, doctorId: number, message?: string): Promise<any> =>
    api.post('/org-membership-requests/remove', { organization_id: organizationId, doctor_id: doctorId, message }),
  mine:    (): Promise<any>                                        => api.get('/org-membership-requests/mine'),
  forOrg:  (organizationId: number): Promise<any>                  => api.get(`/org-membership-requests/org/${organizationId}`),
  respond: (id: number, decision: 'accept' | 'decline'): Promise<any> => api.post(`/org-membership-requests/${id}/respond`, { decision }),
  cancel:  (id: number): Promise<any>                               => api.delete(`/org-membership-requests/${id}`),
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
  // Joining now goes through orgMembershipRequestApi.requestJoin (owner approval required).
  leaveOrganization:   (organizationId: number): Promise<any>    => api.delete(`/users/me/organizations/${organizationId}`),
  toggle:              (id: number): Promise<any>                => api.patch(`/users/${id}/toggle`),
  // SEC-17 #2: professional sign-ups wait for an admin. Without a list, a
  // registration was indistinguishable from a deactivated account and sat
  // unapproved indefinitely.
  pendingApprovals:    (): Promise<any>                          => api.get('/users/pending-approvals'),
  approve:             (id: number): Promise<any>                => api.post(`/users/${id}/approve`),
  decline:             (id: number, reason?: string): Promise<any> => api.post(`/users/${id}/decline`, { reason }),
  remove:              (id: number): Promise<any>                => api.delete(`/users/${id}`),
  getStats:            (): Promise<any>                          => api.get('/users/stats'),
};
