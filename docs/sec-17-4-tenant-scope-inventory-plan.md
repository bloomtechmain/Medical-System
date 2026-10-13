# SEC-17 #4 — Tenant-scoping the shared medicine/supplier catalog

Status: **planning only, not yet implemented** — the audit itself rates this
an "L" effort (a week+), and the user asked for a migration plan before any
code is written. This document is that plan.

## 1. The problem, concretely

`public.medicines` and `public.suppliers` are two plain, un-scoped tables —
no `organization_id`, no tenant column, nothing. Every other pharmacy
resource (`orders`, `order_items`, `sales`, `sale_items`,
`inventory_adjustments`) is already correctly tenant-scoped: each pharmacy
gets its own `tenant_<slug>` schema via `provision_tenant()`
(`corehealth_database.sql` ~line 1042), and `orderController.ts` /
`saleController.ts` already resolve the caller's own schema via
`getTenantSchema(req.user.id)` before touching anything. Medicines and
suppliers are the one piece of pharmacy data that never got that treatment —
they were left shared in `public`, referenced by FK from every pharmacy's
per-tenant tables.

Confirmed live on the current dev DB (2 pharmacy tenants: `healthcare_pharmacy`,
`medplus_pharmacy`):

- `medicineController.ts`, `supplierController.ts`, `inventoryController.ts`
  have **zero** organization/tenant checks — grepped for `organization_id`,
  `org_id`, `req.user` and got no hits in `medicineController.ts`.
- Any authenticated pharmacist, from either pharmacy, can read and write
  every medicine and supplier row system-wide: stock levels, `cost_price`
  (commercially sensitive — this is each pharmacy's buy price, not the
  patient-facing sell price), reorder thresholds, supplier contact details.
- A stock update from Pharmacy A's dashboard changes the number Pharmacy B's
  dashboard shows, because it's the same row.

This is the real risk the audit's "L effort" label is describing: not a
single query missing a `WHERE`, but an entire resource type that was never
tenant-scoped at the schema level, so every call site touching it needs the
same fix `orderController.ts` already has.

## 2. Target state

Each pharmacy gets its own `medicines` and `suppliers` tables, created in
its `tenant_<slug>` schema — the same pattern laboratories already have for
`test_catalog` (`corehealth_database.sql` ~line 1109: each lab's own test
list with its own pricing, created per-tenant in `provision_tenant()`).
`public.medicines` / `public.suppliers` stop being queried directly by any
pharmacy-facing endpoint.

## 3. Schema changes

**3a. `provision_tenant()` — add to the `p_type = 'pharmacy'` branch**
(`corehealth_database.sql`, right before the existing `orders` table, so
`order_items`/`sale_items`/`inventory_adjustments` can FK to the tenant
copy instead of `public.medicines`):

```sql
CREATE TABLE IF NOT EXISTS %I.suppliers (
  -- same columns as public.suppliers today
);
CREATE TABLE IF NOT EXISTS %I.medicines (
  -- same columns as public.medicines today,
  -- supplier_id REFERENCES %I.suppliers(id) instead of public.suppliers(id)
);
```

**3b. Repoint existing FKs** — `order_items.medicine_id`,
`sale_items.medicine_id`, `inventory_adjustments.medicine_id` currently
`REFERENCES public.medicines(id)`; change to `REFERENCES %I.medicines(id)`
(same schema, so a plain unqualified reference works once these are created
in the same `EXECUTE format(...)` block, same as `order_items.order_id
REFERENCES %I.orders(id)` already does).

**3c. Leave `public.medicines` / `public.suppliers` in place, renamed or
frozen** rather than dropped immediately — see rollout section. Dropping
them is the last step, not an early one.

## 4. Data backfill (existing pharmacies only — 2 in dev, check prod count
before running)

For each existing pharmacy organization (`organizations WHERE org_type =
'pharmacy'`):

1. Copy every row currently in `public.medicines` / `public.suppliers` into
   that pharmacy's new `tenant_<slug>.medicines` / `.suppliers` — fresh
   `SERIAL` ids per tenant (each pharmacy gets its own copy, not a shared
   row), since right now every pharmacy effectively already sees the exact
   same catalog, so duplicating it as the starting point for each is the
   correct "no data loss" migration, not an approximation.
2. Build an `old_medicine_id → new_medicine_id` map per tenant (same for
   suppliers) from that copy.
3. Rewrite `medicine_id` in that tenant's own `order_items`, `sale_items`,
   `inventory_adjustments` rows using the map. `supplier_id` in that
   tenant's own `orders` rows gets the same treatment.
4. This is naturally per-tenant and idempotent if scripted as one
   transaction per pharmacy schema — safe to run pharmacy-by-pharmacy
   rather than one big cross-tenant transaction.

Effort note: trivial at 2 tenants / 20 medicines / 6 suppliers (current dev
volume); re-check row counts in whatever environment this actually runs
against before treating the backfill step as "small."

## 5. Application code changes

Every call site needs the same shape of fix `orderController.ts` already
demonstrates: resolve `const schema = await getTenantSchema(req.user.id)`
(reject with 400 if the caller has no pharmacy org), then schema-qualify
every `medicines`/`suppliers` reference as `"${schema}".medicines` instead
of the bare/`public.` name.

| File | What changes |
|---|---|
| `controllers/medicineController.ts` | Full CRUD — every query needs `requireSchema` + `"${schema}".medicines`. This is the main surface; currently has no tenant check at all. |
| `controllers/supplierController.ts` | Same — full CRUD, currently no tenant check at all. |
| `controllers/inventoryController.ts` | Dashboard/low-stock/expiry queries — same treatment. |
| `controllers/saleController.ts` | Already partially tenant-aware for `sales`/`sale_items`; the bare `medicines` joins/updates (lines ~37, 60, 81, 112, 123) need `"${schema}".medicines`. |
| `controllers/orderController.ts` | Already uses `requireSchema`; the bare `medicines`/`suppliers` joins (lines ~21, 43) need the same schema-qualification once those tables move. |
| `controllers/userController.ts` (`getStats`) | The one legitimately **cross-tenant** case — admin's system-wide dashboard. Already does this exact pattern for sales/appointments (`pharmacySchemas.map(s => ...).join(' UNION ALL ')`, ~line 321); extend the same `UNION ALL` approach to the medicines count/value instead of the current flat `SELECT ... FROM public.medicines WHERE is_active=TRUE`. |
| `routes/medicineRoutes.ts`, `routes/supplierRoutes.ts` | No route shape changes expected — the scoping happens inside the controller from `req.user`, same as orders/sales today. |

Not in scope / confirmed unaffected: `consultation_medicines` (patient
prescription line items — unrelated table, already correctly scoped via
RLS under `clinical`), `accessRequestController.ts` and
`prescriptionAssignmentController.ts` only touch `consultation_medicines`,
not the shared catalog.

## 6. Rollout order (so nothing is ever double-counted or silently empty)

1. Ship schema change (3a/3b) — additive, doesn't touch `public.medicines`,
   zero behavior change yet.
2. Run backfill (4) — still additive, `public.medicines` untouched and
   still being served by the old code paths.
3. Ship code changes (5) behind the existing pharmacy-membership check —
   this is the cutover; do it in one deploy, not file-by-file, since a
   pharmacist account with a tenant schema but code still reading
   `public.medicines` (or vice versa) would silently see an empty or stale
   catalog mid-rollout.
4. Verify each pharmacy's dashboard independently post-cutover (stock
   counts, low-stock alerts, a real sale, a real purchase order) before
   touching `public.medicines`/`suppliers` themselves.
5. Only once (4) is clean: drop `public.medicines` / `public.suppliers`,
   or rename them to `_deprecated_*` for one release cycle as a safety net
   before the actual `DROP`.

## 7. Why this wasn't folded into the rest of Tier 2

Every other SEC-17 item fixed this session (#2, #3, #5, #6, #7, MFA, token
revocation) was a bounded change to one or two files with a clear
before/after. This one touches a schema migration, a data backfill across
every existing pharmacy tenant, and six call sites' worth of query
rewrites, with a real cutover-ordering risk if done half-finished. That's
what the audit's own "L" estimate is describing, and it deserves its own
implementation session with its own testing pass — not a same-session
bolt-on next to four other unrelated fixes.
