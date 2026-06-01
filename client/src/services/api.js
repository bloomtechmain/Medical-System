import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
  login:    (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me:       ()     => api.get('/auth/me'),
};

export const medicineApi = {
  getAll: (params) => api.get('/medicines', { params }),
  getOne: (id)     => api.get(`/medicines/${id}`),
  create: (data)   => api.post('/medicines', data),
  update: (id, data) => api.put(`/medicines/${id}`, data),
  remove: (id)     => api.delete(`/medicines/${id}`),
};

export const supplierApi = {
  getAll: ()         => api.get('/suppliers'),
  getOne: (id)       => api.get(`/suppliers/${id}`),
  create: (data)     => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  remove: (id)       => api.delete(`/suppliers/${id}`),
};

export const orderApi = {
  getAll:   ()     => api.get('/orders'),
  getOne:   (id)   => api.get(`/orders/${id}`),
  create:   (data) => api.post('/orders', data),
  receive:  (id)   => api.patch(`/orders/${id}/receive`),
};

export const saleApi = {
  getAll: ()     => api.get('/sales'),
  getOne: (id)   => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
};

export const inventoryApi = {
  summary:  ()      => api.get('/inventory/summary'),
  lowStock: ()      => api.get('/inventory/low-stock'),
  expiring: (days)  => api.get('/inventory/expiring', { params: { days } }),
};

export const consultationApi = {
  getAll:          ()           => api.get('/consultations'),
  getOne:          (id)         => api.get(`/consultations/${id}`),
  create:          (formData)   => api.post('/consultations', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:          (id, formData) => api.put(`/consultations/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateStatus:    (id, status) => api.patch(`/consultations/${id}/status`, { status }),
  remove:          (id)         => api.delete(`/consultations/${id}`),
  getPatientHistory: (patientId) => api.get(`/consultations/patient/${patientId}/history`),
};

export const labApi = {
  getAll:       ()         => api.get('/lab-requests'),
  getOne:       (id)       => api.get(`/lab-requests/${id}`),
  create:       (data)     => api.post('/lab-requests', data),
  uploadReport: (id, formData) => api.patch(`/lab-requests/${id}/report`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateStatus: (id, status)   => api.patch(`/lab-requests/${id}/status`, { status }),
  remove:       (id)       => api.delete(`/lab-requests/${id}`),
};

export const notificationApi = {
  getAll:      () =>  api.get('/notifications'),
  markRead:    (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: ()   => api.patch('/notifications/read-all'),
};

export const userApi = {
  getAll:           (params) => api.get('/users', { params }),
  searchPatients:   (q)      => api.get('/users/patients', { params: { q } }),
  searchPharmacists:   (q) => api.get('/users/pharmacists',  { params: { q } }),
  searchLaboratories:  (q) => api.get('/users/laboratories', { params: { q } }),
  getOne:           (id)     => api.get(`/users/${id}`),
  update:           (id, data) => api.put(`/users/${id}`, data),
  toggle:           (id)     => api.patch(`/users/${id}/toggle`),
  remove:           (id)     => api.delete(`/users/${id}`),
  getStats:         ()       => api.get('/users/stats'),
};
