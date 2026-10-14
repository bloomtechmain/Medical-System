# 0003 — A PostgreSQL schema per organisation

**Status:** Accepted
**Date:** 2026-10-14 (recording a decision made earlier)

## Context

Hospitals, pharmacies, clinics and laboratories each hold operational data
that belongs to them alone — a pharmacy's medicine catalogue, stock levels,
cost prices, orders and sales; a laboratory's test catalogue. One
organisation reading another's is a commercial disclosure as well as a
correctness problem.

`MULTITENANT_GUIDE.md` covers the design in full. This record exists for the
decision and its trade-offs.

## Decision

Three layers, each chosen for a different reason:

1. **`public`** — shared identity. One `users` row per person, globally. A
   doctor who works at two hospitals is one account, not two.
2. **`clinical`** — patient data, shared but protected by row-level security.
   Patient records cross organisational boundaries by nature: a patient's
   history follows the patient, not the hospital.
3. **`tenant_<slug>`** — one schema per organisation, created by
   `provision_tenant()`, holding only that organisation's operational tables.

Tenant isolation is **physical**: a query against `tenant_a.medicines` cannot
return `tenant_b`'s rows, because they are different tables. There is no
`organization_id` column to forget in a `WHERE` clause.

## Why not a discriminator column

A shared table with `organization_id` and RLS would have been less machinery.
Rejected because the failure mode is far worse: one missing `WHERE
organization_id = ?` silently returns everyone's data, and that is a mistake
every developer makes eventually.

This is not hypothetical here. `medicines` and `suppliers` were originally
shared tables in `public`, and the audit found (SEC-17 #4) that **any
pharmacist could read and write every other pharmacy's stock levels and cost
prices**, because the controllers had no organisation check anywhere. Every
resource that was already schema-per-tenant — orders, sales, inventory
adjustments — was correctly isolated, by construction, with nobody having to
remember anything. The two tables that were not were the only ones that
leaked.

That is the entire argument, and it was proven in production code.

## Consequences

**Good:** cross-tenant leakage of operational data is structurally impossible
rather than a code-review responsibility. Per-tenant roles add a second layer.
A tenant's data can be dropped or exported as a unit.

**Costs, accepted:**

- **Cross-tenant queries are awkward.** Platform-wide admin statistics need a
  `UNION ALL` over every tenant schema, and that query grows with the number
  of organisations (DB-08). Mitigated with `platform_stats_cache`, recomputed
  on a staleness window instead of per request.
- **Migrations must iterate schemas.** A change to a tenant table means
  redefining `provision_tenant()` *and* applying it to existing tenants.
  Migration 006 is the worked example.
- **It does not scale to thousands of tenants.** Hundreds of schemas is fine;
  tens of thousands means a lot of tables and a slow `pg_dump`. For hospitals
  and pharmacies in one country, hundreds is the realistic ceiling.
- **Two sources of schema truth.** `corehealth_database.sql` and
  `server/migrations/` both have to describe `provision_tenant()`, and they
  have silently diverged before, badly — see migration 006's header. CI now
  tests both paths against a real database.

## What would change this

- Tenant count heading past a few hundred, which would push towards a shared
  table with RLS and much stricter query review, or a database per tenant.
- Needing frequent real-time cross-tenant analytics, which this shape is bad
  at. The answer would be to export into a separate analytical store rather
  than to restructure the transactional one.
