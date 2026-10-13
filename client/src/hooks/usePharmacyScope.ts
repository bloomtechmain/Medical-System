import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { orgApi } from '../services/api';

// SEC-17 #4: medicines/suppliers/inventory moved from one shared public
// table into each pharmacy's own tenant schema. A pharmacist is always
// scoped to their own org server-side (no change needed from them) — but
// admin's /admin/medicines /admin/suppliers /admin/inventory pages used to
// show one global list and now have to pick which pharmacy they're looking
// at, since there's no single list anymore. This hook is that picker state,
// shared across the three admin-reachable pages.
export function usePharmacyScope() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [orgId, setOrgId] = useState<number | null>(null);

  const { data: pharmacyOrgs = [] } = useQuery({
    queryKey: ['pharmacy-orgs-for-scope'],
    queryFn: () => orgApi.getAll(),
    enabled: isAdmin,
    select: (orgs: any) => (orgs as any[]).filter(o => o.org_type === 'pharmacy'),
  });

  // Non-admin: always "ready" — the server resolves their own pharmacy via
  // membership, no organization_id needed on the wire at all.
  const ready = !isAdmin || !!orgId;
  const params = isAdmin && orgId ? { organization_id: orgId } : {};

  return { isAdmin, orgId, setOrgId, pharmacyOrgs: pharmacyOrgs as any[], ready, params };
}
