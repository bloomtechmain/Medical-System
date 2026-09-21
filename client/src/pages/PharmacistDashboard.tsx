import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { inventoryApi, saleApi, authApi, orderApi, medicineApi } from '../services/api';
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
      toast.success('Order received — stock updated');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to receive order'),
  });

  const profile = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Pharmacist';

  const todaySales = sales.filter(
    (s: any) => new Date(s.sold_at).toDateString() === new Date().toDateString()
  );
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + parseFloat(s.total_amount), 0);

  const pendingOrders = orders.filter((o: any) => o.status === 'pending');

  const recentActivity = [
    ...sales.slice(0, 10).map((s: any) => ({
      type: 'sale' as const, at: s.sold_at,
      title: s.customer_name || 'Walk-in sale', amount: parseFloat(s.total_amount),
    })),
    ...orders.filter((o: any) => o.status === 'received' && o.received_at).slice(0, 10).map((o: any) => ({
      type: 'order' as const, at: o.received_at,
      title: `Order received — ${o.supplier_name || 'Supplier'}`, amount: parseFloat(o.total_amount),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  const comparison = analytics?.comparison;
  const profit = analytics?.profit;
  const trend = analytics?.trend || [];
  const topMedicines = analytics?.topMedicines || [];

  const statLinks: Record<string, string> = {
    'Total Medicines': '/pharmacist/medicines',
    'Low Stock Items': '/pharmacist/inventory',
    'Expired Items': '/pharmacist/medicines',
    "Today's Revenue": '/pharmacist/sales',
  };

  return (
    <div className="space-y-6">
      {/* Welcome banner + stats list */}
      <div className="w-full lg:w-3/4 bg-gradient-to-r from-purple-600 to-purple-900 rounded-2xl p-6 text-white">
        <p className="text-purple-200 text-sm font-medium">Welcome,</p>
        <h1 className="text-2xl font-bold mt-0.5">{firstName} 💊</h1>
        <p className="text-purple-200 text-sm mt-2">
          {profile?.pharmacy_name || 'Pharmacy'} · Core Health Portal
        </p>

        <div className="mt-5 -mx-6 border-t border-white/15 divide-y divide-white/10">
          {(() => {
            const fields = [
              { label: 'Total Medicines',  value: summary?.total_medicines ?? '—',  sub: null },
              { label: 'Low Stock Items',  value: summary?.low_stock_count ?? '—',  sub: null },
              { label: 'Expired Items',    value: summary?.expired_count   ?? '—',  sub: null },
              { label: "Today's Revenue",  value: formatCurrency(todayRevenue),     sub: `${todaySales.length} sales` },
            ];
            const rows = [];
            for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
            return rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 divide-x divide-white/10 max-w-2xl">
                {row.map((c) => (
                  <Link
                    to={statLinks[c.label]}
                    key={c.label}
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
            + New Sale
          </button>
          <button className="btn-secondary" onClick={() => navigate('/pharmacist/medicines', { state: { autoOpen: true } })}>
            + Add Medicine
          </button>
          <button className="btn-secondary" onClick={() => navigate('/pharmacist/orders', { state: { autoOpen: true } })}>
            + New Order
          </button>
        </div>
        <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <input
            className="input"
            placeholder="Jump to a medicine..."
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
                  <span className="text-xs text-gray-400">{m.stock_quantity} in stock</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sales trend + revenue/profit summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Sales Trend (14 days)</h3>
          {trend.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No sales data yet.</div>
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
          <h3 className="text-sm font-semibold text-gray-700">Revenue & Profit</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Today vs Yesterday</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(comparison?.today ?? 0)}</p>
              <ChangeBadge pct={comparison ? pctChange(comparison.today, comparison.yesterday) : null} />
            </div>
            <div>
              <p className="text-xs text-gray-400">This Week vs Last</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(comparison?.thisWeek ?? 0)}</p>
              <ChangeBadge pct={comparison ? pctChange(comparison.thisWeek, comparison.lastWeek) : null} />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Profit Margin (30 days)</p>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-gray-900">{formatCurrency(profit?.profit ?? 0)}</span>
              <span className="text-sm font-semibold text-purple-600">{(profit?.marginPct ?? 0).toFixed(1)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Revenue {formatCurrency(profit?.revenue ?? 0)} · Cost {formatCurrency(profit?.cost ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Low stock + expiring soon */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Low Stock Alerts</h3>
          {lowStock.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">All stock levels are healthy.</p>
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
                      {suggested > 0 && <span className="block text-xs text-gray-400">Suggest reorder: {suggested}</span>}
                    </div>
                    <span className={`badge ${status.color}`}>{m.stock_quantity} left</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Expiring Soon (30 days)</h3>
          {expiring.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">Nothing expiring soon.</p>
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
                    <span className={`badge ${expiryColor(days)}`}>{days}d left</span>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Selling Medicines (30 days)</h3>
          {topMedicines.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No sales in this period.</div>
          ) : (
            <ul className="space-y-2">
              {topMedicines.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-gray-700 font-medium">{m.name}</span>
                    <span className="block text-xs text-gray-400">{m.quantity} units sold</span>
                  </div>
                  <span className="font-semibold text-gray-900">{formatCurrency(m.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Pending Orders</h3>
          {pendingOrders.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">No pending orders.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingOrders.slice(0, 8).map((o: any) => (
                <li key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-gray-700 font-medium">{o.supplier_name || 'Supplier'}</span>
                    <span className="block text-xs text-gray-400">{formatDate(o.ordered_at)} · {formatCurrency(o.total_amount)}</span>
                  </div>
                  <button
                    className="btn-secondary text-xs py-1 px-2"
                    disabled={receiveMutation.isPending}
                    onClick={() => receiveMutation.mutate(o.id)}
                  >
                    Mark Received
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-2xl mb-2">🧾</p>
            <p className="text-sm">No activity yet.</p>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Pharmacy Information</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Pharmacy Name',   value: (profile as any).pharmacy_name },
              { label: 'License No.',     value: (profile as any).license_number },
              { label: 'Phone',           value: (profile as any).phone },
              { label: 'Address',         value: (profile as any).pharmacy_address },
              { label: 'Experience',      value: (profile as any).years_experience ? `${(profile as any).years_experience} years` : null },
              { label: 'Specialization',  value: (profile as any).specialization_area },
            ].map(({ label, value }) => (
              <div key={label}>
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
