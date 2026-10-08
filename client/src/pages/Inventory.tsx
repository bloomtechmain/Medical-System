import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inventoryApi } from '../services/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import Table from '../components/common/Table';

export default function Inventory() {
  const { t } = useTranslation('pharmacist');
  const { data: summary } = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const { data: lowStock = [], isLoading: loadingLow } = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock });
  const { data: expiring = [], isLoading: loadingExp } = useQuery({ queryKey: ['expiring'], queryFn: () => inventoryApi.expiring(60) });

  const lowStockCols = [
    { key: 'name', header: t('inventory.columns.medicine') },
    { key: 'category', header: t('inventory.columns.category') },
    { key: 'stock_quantity', header: t('inventory.columns.currentStock'), render: (r: any) => (
      <span className="badge bg-yellow-100 text-yellow-700">{r.stock_quantity}</span>
    )},
    { key: 'reorder_level', header: t('inventory.columns.reorderLevel') },
  ];

  const expiringCols = [
    { key: 'name', header: t('inventory.columns.medicine') },
    { key: 'stock_quantity', header: t('inventory.columns.stock') },
    { key: 'expiry_date', header: t('inventory.columns.expiryDate'), render: (r: any) => (
      <span className={new Date(r.expiry_date) < new Date() ? 'text-red-600 font-medium' : 'text-yellow-600'}>
        {formatDate(r.expiry_date)}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader title={t('inventory.pageTitle')} description={t('inventory.pageDescription')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label={t('inventory.stats.totalMedicines')} value={summary?.total_medicines ?? '—'} icon="💊" color="blue" />
        <StatCard label={t('inventory.stats.lowStock')} value={summary?.low_stock_count ?? '—'} icon="⚠️" color="yellow" />
        <StatCard label={t('inventory.stats.expired')} value={summary?.expired_count ?? '—'} icon="🚫" color="red" />
        <StatCard label={t('inventory.stats.inventoryValue')} value={formatCurrency(summary?.inventory_value)} icon="💰" color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('inventory.lowStockTitle')}</h2>
          <Table columns={lowStockCols} data={lowStock} loading={loadingLow} emptyText={t('inventory.noLowStock')} />
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('inventory.expiringTitle')}</h2>
          <Table columns={expiringCols} data={expiring} loading={loadingExp} emptyText={t('inventory.noExpiring')} />
        </div>
      </div>
    </div>
  );
}
