import { useQuery } from '@tanstack/react-query';
import { inventoryApi, saleApi, authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/helpers';

export default function PharmacistDashboard() {
  const { user } = useAuth();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: saleApi.getAll });
  const { data: lowStock = [] } = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock });

  const profile = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Pharmacist';

  const todaySales = sales.filter(
    (s: any) => new Date(s.sold_at).toDateString() === new Date().toDateString()
  );
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + parseFloat(s.total_amount), 0);

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-900 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-200 text-sm font-medium">Welcome,</p>
            <h1 className="text-2xl font-bold mt-0.5">{firstName} 💊</h1>
            <p className="text-purple-200 text-sm mt-2">
              {profile?.pharmacy_name || 'Pharmacy'} · Core Health Portal
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-center bg-white/10 rounded-xl p-4">
            <span className="text-4xl">👩‍⚕️</span>
            <p className="text-xs mt-1 text-purple-200">Pharmacist</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Medicines',  value: summary?.total_medicines ?? '—',  icon: '💊', bg: 'bg-blue-50   border-blue-100'   },
          { label: 'Low Stock Items',  value: summary?.low_stock_count ?? '—',  icon: '⚠️', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Expired Items',    value: summary?.expired_count   ?? '—',  icon: '🚫', bg: 'bg-red-50    border-red-100'    },
          { label: "Today's Revenue",  value: formatCurrency(todayRevenue),      icon: '💰', bg: 'bg-green-50  border-green-100'  },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border p-5 ${c.bg}`}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
            {c.label === "Today's Revenue" && (
              <p className="text-xs text-gray-400 mt-0.5">{todaySales.length} sales</p>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Low stock alerts */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Low Stock Alerts</h3>
          {lowStock.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">All stock levels are healthy.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lowStock.slice(0, 8).map((m: any) => (
                <li key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700 font-medium">{m.name}</span>
                  <span className="bg-yellow-100 text-yellow-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {m.stock_quantity} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent sales */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Sales</h3>
          {sales.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">🧾</p>
              <p className="text-sm">No sales recorded yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sales.slice(0, 8).map((s: any) => (
                <li key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-700 font-medium">{s.customer_name || 'Walk-in'}</p>
                    <p className="text-xs text-gray-400">{formatDate(s.sold_at)}</p>
                  </div>
                  <span className="font-semibold text-gray-900">{formatCurrency(s.total_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
