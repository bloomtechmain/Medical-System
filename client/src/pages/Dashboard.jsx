import { useQuery } from '@tanstack/react-query';
import { inventoryApi, saleApi } from '../services/api';
import StatCard from '../components/common/StatCard';
import PageHeader from '../components/common/PageHeader';
import { formatCurrency, formatDate } from '../utils/helpers';

export default function Dashboard() {
  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: saleApi.getAll });
  const { data: lowStock = [] } = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock });

  const todaySales = sales.filter(
    (s) => new Date(s.sold_at).toDateString() === new Date().toDateString()
  );
  const todayRevenue = todaySales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0);

  return (
    <div>
      <PageHeader title="Dashboard" description="Pharmacy overview at a glance" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Medicines" value={summary?.total_medicines ?? '—'} icon="💊" color="blue" />
        <StatCard label="Low Stock Items" value={summary?.low_stock_count ?? '—'} icon="⚠️" color="yellow" />
        <StatCard label="Expired Items" value={summary?.expired_count ?? '—'} icon="🚫" color="red" />
        <StatCard
          label="Today's Revenue"
          value={formatCurrency(todayRevenue)}
          icon="💰"
          color="green"
          sub={`${todaySales.length} sales`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Low Stock Alerts</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-400">All stock levels are healthy.</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{m.name}</span>
                  <span className="badge bg-yellow-100 text-yellow-700">{m.stock_quantity} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Sales</h2>
          {sales.length === 0 ? (
            <p className="text-sm text-gray-400">No sales recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {sales.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{s.customer_name || 'Walk-in'}</span>
                  <span className="text-gray-500 text-xs">{formatDate(s.sold_at)}</span>
                  <span className="font-medium">{formatCurrency(s.total_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
