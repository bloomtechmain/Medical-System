export const formatCurrency = (amount: number | null | undefined): string =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount ?? 0);

export const formatDate = (dateStr: string | null | undefined): string =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-LK') : '—';

export const formatDateTime = (dateStr: string | null | undefined): string =>
  dateStr ? new Date(dateStr).toLocaleString('en-LK') : '—';

export const isExpiringSoon = (dateStr: string | null | undefined, days = 30): boolean => {
  if (!dateStr) return false;
  const diff = (new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

export const isExpired = (dateStr: string | null | undefined): boolean =>
  dateStr ? new Date(dateStr) < new Date() : false;

// Every dashboard greeted people with `name.split(' ')[0]`, which is the
// honorific — not the name — whenever one is stored. A doctor saved as
// "Dr. Janaka Perera" got "Dr.", and the doctor/clinic/hospital greetings then
// prefix that with "Dr." again, so the masthead read "Dr. Dr.". Skip any
// leading title and take the first real word.
const HONORIFICS = /^(dr|prof|mr|mrs|ms|miss|rev|ven|hon)\.?$/i;

export const firstNameOf = (fullName: string | null | undefined, fallback: string): string => {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts.find(p => !HONORIFICS.test(p));
  return first || fallback;
};

export const stockStatus = (qty: number, reorder: number): { label: string; color: string } => {
  if (qty === 0) return { label: 'Out of Stock', color: 'text-red-700 bg-red-100' };
  if (qty <= reorder) return { label: 'Low Stock', color: 'text-yellow-700 bg-yellow-100' };
  return { label: 'In Stock', color: 'text-green-700 bg-green-100' };
};
