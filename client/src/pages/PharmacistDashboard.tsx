import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { inventoryApi, saleApi, authApi, orderApi, medicineApi, consultationApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { formatCurrency, formatDate, formatDateTime, stockStatus } from '../utils/helpers';

const daysUntil = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const expiryColor = (days: number): string => {
  if (days <= 7) return 'bg-red-100 text-red-700';
  if (days <= 14) return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-700';
};

const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
};

const ChangeBadge = ({ pct }: { pct: number | null }) => {
  if (pct === null) return <span className="text-xs text-gray-400">—</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
};

export default function PharmacistDashboard() {
  const { t } = useTranslation('pharmacist');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: saleApi.getAll });
  const { data: lowStock = [] } = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock });
  const { data: expiring = [] } = useQuery({ queryKey: ['expiring', 30], queryFn: () => inventoryApi.expiring(30) });
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: orderApi.getAll });
  const { data: analytics } = useQuery({ queryKey: ['sales-analytics'], queryFn: saleApi.analytics });
  const { data: prescriptions = [] } = useQuery({ queryKey: ['pharmacist-consultations'], queryFn: consultationApi.getAll });

  const [medSearch, setMedSearch] = useState('');
  const debouncedMedSearch = useDebounce(medSearch);
  const { data: searchResults = [] } = useQuery({
    queryKey: ['med-search', debouncedMedSearch],
    queryFn: () => medicineApi.getAll({ search: debouncedMedSearch }),
    enabled: debouncedMedSearch.trim().length > 1,
  });

  const receiveMutation = useMutation({
    mutationFn: orderApi.receive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      toast.success(t('dashboard.toast.orderReceived'));
    },
    onError: (err: any) => toast.error(err.message || t('dashboard.toast.orderReceiveFailed')),
  });

  const profile = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || t('dashboard.defaultName');

  const todaySales = sales.filter(
    (s: any) => new Date(s.sold_at).toDateString() === new Date().toDateString()
  );
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + parseFloat(s.total_amount), 0);

  const pendingOrders = orders.filter((o: any) => o.status === 'pending');

  const pendingRx   = (prescriptions as any[]).filter((c: any) => c.status === 'active').length;
  const preparingRx = (prescriptions as any[]).filter((c: any) => c.status === 'preparing').length;
  const readyRx     = (prescriptions as any[]).filter((c: any) => c.status === 'dispensed').length;
  const actionableRx = (prescriptions as any[])
    .filter((c: any) => c.status === 'active' || c.status === 'preparing')
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 5);

  const recentActivity = [
    ...sales.slice(0, 10).map((s: any) => ({
      type: 'sale' as const, at: s.sold_at,
      title: s.customer_name || t('dashboard.walkInSale'), amount: parseFloat(s.total_amount),
    })),
    ...orders.filter((o: any) => o.status === 'received' && o.received_at).slice(0, 10).map((o: any) => ({
      type: 'order' as const, at: o.received_at,
      title: t('dashboard.orderReceivedFrom', { supplier: o.supplier_name || t('dashboard.defaultSupplier') }), amount: parseFloat(o.total_amount),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  const comparison = analytics?.comparison;
  const profit = analytics?.profit;
  const trend = analytics?.trend || [];
  const topMedicines = analytics?.topMedicines || [];

  const statLinks: Record<string, string> = {
    totalMedicines: '/pharmacist/medicines',
    lowStockItems: '/pharmacist/inventory',
    expiredItems: '/pharmacist/medicines',
    todaysRevenue: '/pharmacist/sales',
  };

  return (
    <div className="space-y-6">
      {/* Welcome banner + stats list */}
      <div className="w-full lg:w-3/4 bg-gradient-to-r from-purple-600 to-purple-900 rounded-2xl p-6 text-white">
        <p className="text-purple-200 text-sm font-medium">{t('dashboard.welcome')}</p>
        <h1 className="text-2xl font-bold mt-0.5">{firstName} 💊</h1>
        <p className="text-purple-200 text-sm mt-2">
          {profile?.pharmacy_name || t('dashboard.defaultPharmacyName')} · {t('dashboard.portalSuffix')}
        </p>

        <div className="mt-5 -mx-6 border-t border-white/15 divide-y divide-white/10">
          {(() => {
            const fields = [
              { key: 'totalMedicines', label: t('dashboard.stats.totalMedicines'), value: summary?.total_medicines ?? '—',  sub: null },
              { key: 'lowStockItems', label: t('dashboard.stats.lowStockItems'),  value: summary?.low_stock_count ?? '—',  sub: null },
              { key: 'expiredItems', label: t('dashboard.stats.expiredItems'),    value: summary?.expired_count   ?? '—',  sub: null },
              { key: 'todaysRevenue', label: t('dashboard.stats.todaysRevenue'),  value: formatCurrency(todayRevenue),     sub: t('dashboard.stats.salesCount', { count: todaySales.length }) },
            ];
            const rows = [];
            for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
            return rows.map((row, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-white/10 max-w-2xl">
                {row.map((c) => (
                  <Link
                    to={statLinks[c.key]}
                    key={c.key}
                    className="flex items-center gap-3 px-6 py-3 min-w-0 hover:bg-white/5 transition-colors"
                  >
                    <span className="flex-1 text-sm text-purple-100 truncate">{c.label}</span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-bold text-white">{c.value}</span>
                      {c.sub && <span className="block text-xs text-purple-300">{c.sub}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Quick actions + medicine search */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => navigate('/pharmacist/sales', { state: { autoOpen: true } })}>
            {t('dashboard.quickActions.newSale')}
          </button>
          <button className="btn-secondary" onClick={() => navigate('/pharmacist/medicines', { state: { autoOpen: true } })}>
            {t('dashboard.quickActions.addMedicine')}
          </button>
          <button className="btn-secondary" onClick={() => navigate('/pharmacist/orders', { state: { autoOpen: true } })}>
            {t('dashboard.quickActions.newOrder')}
          </button>
        </div>
        <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <input
            className="input"
            placeholder={t('dashboard.searchPlaceholder')}
            value={medSearch}
            onChange={(e) => setMedSearch(e.target.value)}
          />
          {debouncedMedSearch.trim().length > 1 && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
              {searchResults.slice(0, 8).map((m: any) => (
                <button
                  key={m.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  onClick={() => navigate('/pharmacist/medicines', { state: { search: m.name } })}
                >
                  <span className="text-gray-700">{m.name}</span>
                  <span className="text-xs text-gray-400">{t('dashboard.inStock', { count: m.stock_quantity })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Incoming prescriptions from doctors & patients */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('dashboard.prescriptions.title')}</h3>
          <Link to="/pharmacist/consultations" className="text-xs font-semibold text-purple-600 hover:text-purple-700">{tc('actions.viewAll')}</Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Link to="/pharmacist/consultations" className="rounded-xl border border-yellow-100 bg-yellow-50 p-3 hover:shadow-sm transition-shadow">
            <p className="text-2xl font-bold text-gray-900">{pendingRx}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.prescriptions.pending')}</p>
          </Link>
          <Link to="/pharmacist/consultations" className="rounded-xl border border-blue-100 bg-blue-50 p-3 hover:shadow-sm transition-shadow">
            <p className="text-2xl font-bold text-gray-900">{preparingRx}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.prescriptions.preparing')}</p>
          </Link>
          <Link to="/pharmacist/consultations" className="rounded-xl border border-green-100 bg-green-50 p-3 hover:shadow-sm transition-shadow">
            <p className="text-2xl font-bold text-gray-900">{readyRx}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.prescriptions.ready')}</p>
          </Link>
        </div>
        {actionableRx.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-2xl mb-2">💊</p>
            <p className="text-sm">{t('dashboard.prescriptions.empty')}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {actionableRx.map((c: any) => (
              <li key={c.id}>
                <Link to="/pharmacist/consultations" className="flex items-center justify-between text-sm py-2 px-1 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg -mx-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 shrink-0 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">{c.patient_name?.charAt(0) || '?'}</span>
                    <div className="min-w-0">
                      <p className="text-gray-700 font-medium truncate">{c.patient_name}</p>
                      <p className="text-xs text-gray-400">{c.doctor_display_name ? t('dashboard.prescriptions.fromDoctor', { name: c.doctor_display_name }) : t('dashboard.prescriptions.selfRequested')}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'preparing' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {c.status === 'preparing' ? t('dashboard.prescriptions.preparing') : t('dashboard.prescriptions.pending')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sales trend + revenue/profit summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.salesTrendTitle')}</h3>
          {trend.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">{t('dashboard.noSalesData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} fontSize={11} stroke="#9ca3af" />
                <YAxis fontSize={11} stroke="#9ca3af" width={70} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(v as number)}
                  labelFormatter={(d) => formatDate(d as string)}
                />
                <Line type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('dashboard.revenueProfitTitle')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">{t('dashboard.todayVsYesterday')}</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(comparison?.today ?? 0)}</p>
              <ChangeBadge pct={comparison ? pctChange(comparison.today, comparison.yesterday) : null} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('dashboard.thisWeekVsLast')}</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(comparison?.thisWeek ?? 0)}</p>
              <ChangeBadge pct={comparison ? pctChange(comparison.thisWeek, comparison.lastWeek) : null} />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">{t('dashboard.profitMarginTitle')}</p>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-gray-900">{formatCurrency(profit?.profit ?? 0)}</span>
              <span className="text-sm font-semibold text-purple-600">{(profit?.marginPct ?? 0).toFixed(1)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {t('dashboard.revenueCostLine', { revenue: formatCurrency(profit?.revenue ?? 0), cost: formatCurrency(profit?.cost ?? 0) })}
            </p>
          </div>
        </div>
      </div>

      {/* Low stock + expiring soon */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.lowStockAlertsTitle')}</h3>
          {lowStock.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">{t('dashboard.allStockHealthy')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lowStock.slice(0, 8).map((m: any) => {
                const status = stockStatus(m.stock_quantity, m.reorder_level);
                const suggested = Math.max(m.reorder_level * 2 - m.stock_quantity, 0);
                return (
                  <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-gray-700 font-medium">{m.name}</span>
                      {suggested > 0 && <span className="block text-xs text-gray-400">{t('dashboard.suggestReorder', { count: suggested })}</span>}
                    </div>
                    <span className={`badge ${status.color}`}>{t('dashboard.itemsLeft', { count: m.stock_quantity })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.expiringSoonTitle')}</h3>
          {expiring.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">{t('dashboard.nothingExpiringSoon')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {expiring.slice(0, 8).map((m: any) => {
                const days = daysUntil(m.expiry_date) ?? 0;
                return (
                  <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-gray-700 font-medium">{m.name}</span>
                      <span className="block text-xs text-gray-400">{formatDate(m.expiry_date)}</span>
                    </div>
                    <span className={`badge ${expiryColor(days)}`}>{t('dashboard.daysLeft', { count: days })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Top selling medicines + pending orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.topSellingTitle')}</h3>
          {topMedicines.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">{t('dashboard.noSalesPeriod')}</div>
          ) : (
            <ul className="space-y-2">
              {topMedicines.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-gray-700 font-medium">{m.name}</span>
                    <span className="block text-xs text-gray-400">{t('dashboard.unitsSold', { count: m.quantity })}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{formatCurrency(m.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.pendingOrdersTitle')}</h3>
          {pendingOrders.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">{t('dashboard.noPendingOrders')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingOrders.slice(0, 8).map((o: any) => (
                <li key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-gray-700 font-medium">{o.supplier_name || t('dashboard.defaultSupplier')}</span>
                    <span className="block text-xs text-gray-400">{formatDate(o.ordered_at)} · {formatCurrency(o.total_amount)}</span>
                  </div>
                  <button
                    className="btn-secondary text-xs py-1 px-2"
                    disabled={receiveMutation.isPending}
                    onClick={() => receiveMutation.mutate(o.id)}
                  >
                    {t('dashboard.markReceived')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.recentActivityTitle')}</h3>
        {recentActivity.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-2xl mb-2">🧾</p>
            <p className="text-sm">{t('dashboard.noActivityYet')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recentActivity.map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span>{a.type === 'sale' ? '🧾' : '📦'}</span>
                  <div>
                    <p className="text-gray-700 font-medium">{a.title}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(a.at)}</p>
                  </div>
                </div>
                <span className="font-semibold text-gray-900">{formatCurrency(a.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pharmacy profile */}
      {profile && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.pharmacyInfoTitle')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { key: 'pharmacyName',  label: t('dashboard.fields.pharmacyName'), value: (profile as any).pharmacy_name },
              { key: 'licenseNo',     label: t('dashboard.fields.licenseNo'), value: (profile as any).license_number },
              { key: 'phone',         label: tc('fields.phone'), value: (profile as any).phone },
              { key: 'address',       label: tc('fields.address'), value: (profile as any).pharmacy_address },
              { key: 'experience',    label: t('dashboard.fields.experience'), value: (profile as any).years_experience ? t('dashboard.fields.experienceYears', { count: (profile as any).years_experience }) : null },
              { key: 'specialization', label: t('dashboard.fields.specialization'), value: (profile as any).specialization_area },
            ].map(({ key, label, value }) => (
              <div key={key}>
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm text-gray-900 font-semibold mt-0.5">{value || <span className="text-gray-300">—</span>}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
