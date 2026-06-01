import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../services/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import Table from '../components/common/Table';

export default function Inventory() {
  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const { data: lowStock = [], isLoading: loadingLow } = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock });
  const { data: expiring = [], isLoading: loadingExp } = useQuery({ queryKey: ['expiring'], queryFn: () => inventoryApi.expiring(60) });

  const lowStockCols = [
    { key: 'name', header: 'Medicine' },
    { key: 'category', header: 'Category' },
    { key: 'stock_quantity', header: 'Current Stock', render: (r) => (
      <span className="badge bg-yellow-100 text-yellow-700">{r.stock_quantity}</span>
    )},
    { key: 'reorder_level', header: 'Reorder Level' },
  ];

  const expiringCols = [
    { key: 'name', header: 'Medicine' },
    { key: 'stock_quantity', header: 'Stock' },
    { key: 'expiry_date', header: 'Expiry Date', render: (r) => (
      <span className={new Date(r.expiry_date) < new Date() ? 'text-red-600 font-medium' : 'text-yellow-600'}>
        {formatDate(r.expiry_date)}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader title="Inventory" description="Stock levels and alerts" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Medicines" value={summary?.total_medicines ?? '—'} icon="💊" color="blue" />
        <StatCard label="Low Stock" value={summary?.low_stock_count ?? '—'} icon="⚠️" color="yellow" />
        <StatCard label="Expired" value={summary?.expired_count ?? '—'} icon="🚫" color="red" />
        <StatCard label="Inventory Value" value={formatCurrency(summary?.inventory_value)} icon="💰" color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Low Stock Items</h2>
          <Table columns={lowStockCols} data={lowStock} loading={loadingLow} emptyText="No low stock items." />
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Expiring Within 60 Days</h2>
          <Table columns={expiringCols} data={expiring} loading={loadingExp} emptyText="No items expiring soon." />
        </div>
      </div>
    </div>
  );
}
