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
    if (err.response?.status === 401) {
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
  getAll: (): Promise<any>              => api.get('/sales'),
  getOne: (id: number): Promise<any>    => api.get(`/sales/${id}`),
  create: (data: unknown): Promise<any> => api.post('/sales', data),
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
  updateStatus:     (id: number, status: string): Promise<any>     => api.patch(`/consultations/${id}/status`, { status }),
  remove:           (id: number): Promise<any>                     => api.delete(`/consultations/${id}`),
  updateByPatient:  (id: number, data: unknown): Promise<any>      => api.put(`/consultations/${id}/patient`, data),
  getPatientHistory:(patientId: number): Promise<any>              => api.get(`/consultations/patient/${patientId}/history`),
  assignPharmacy:   (id: number, pharmacist_id: number): Promise<any> => api.patch(`/consultations/${id}/assign-pharmacy`, { pharmacist_id }),
};

export const labApi = {
  getAll:       (): Promise<any>                               => api.get('/lab-requests'),
  getOne:       (id: number): Promise<any>                     => api.get(`/lab-requests/${id}`),
  create:       (data: unknown): Promise<any>                  => api.post('/lab-requests', data),
  uploadReport: (id: number, formData: FormData): Promise<any> => api.patch(`/lab-requests/${id}/report`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateStatus: (id: number, status: string): Promise<any>     => api.patch(`/lab-requests/${id}/status`, { status }),
  remove:       (id: number): Promise<any>                     => api.delete(`/lab-requests/${id}`),
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
  get:     (): Promise<any>              => api.get('/patient-vitals'),
  history: (): Promise<any>             => api.get('/patient-vitals/history'),
  save:    (data: unknown): Promise<any> => api.post('/patient-vitals', data),
};

export const userApi = {
  getAll:              (params?: unknown): Promise<any>          => api.get('/users', { params }),
  searchPatients:      (q: string): Promise<any>                 => api.get('/users/patients', { params: { q } }),
  searchPharmacists:   (q: string): Promise<any>                 => api.get('/users/pharmacists', { params: { q } }),
  searchLaboratories:  (q: string): Promise<any>                 => api.get('/users/laboratories', { params: { q } }),
  getOne:              (id: number): Promise<any>                => api.get(`/users/${id}`),
  update:              (id: number, data: unknown): Promise<any> => api.put(`/users/${id}`, data),
  toggle:              (id: number): Promise<any>                => api.patch(`/users/${id}/toggle`),
  remove:              (id: number): Promise<any>                => api.delete(`/users/${id}`),
  getStats:            (): Promise<any>                          => api.get('/users/stats'),
};
