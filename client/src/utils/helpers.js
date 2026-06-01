export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount ?? 0);

export const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-LK') : '—';

export const formatDateTime = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleString('en-LK') : '—';

export const isExpiringSoon = (dateStr, days = 30) => {
  if (!dateStr) return false;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

export const isExpired = (dateStr) =>
  dateStr ? new Date(dateStr) < new Date() : false;

export const stockStatus = (qty, reorder) => {
  if (qty === 0) return { label: 'Out of Stock', color: 'text-red-700 bg-red-100' };
  if (qty <= reorder) return { label: 'Low Stock', color: 'text-yellow-700 bg-yellow-100' };
  return { label: 'In Stock', color: 'text-green-700 bg-green-100' };
};
