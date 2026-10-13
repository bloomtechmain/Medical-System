// Integration test against a REAL Postgres database (not mocked) — proves that
// a database built from server/migrations/ actually matches what the
// application code expects of a pharmacy tenant.
//
// This exists because three separate bugs of exactly this kind reached main,
// and every one of them was invisible to the mocked controller tests:
//
//   1. SEC-17 #4 moved medicines/suppliers into per-tenant schemas and updated
//      corehealth_database.sql and the controllers, but never added a
//      migration. On any migration-built database (CI, a fresh dev database,
//      the new AWS production database) the tenant tables did not exist at
//      all, so every medicine/supplier/inventory endpoint hit a missing table.
//   2. Migration 002 added PRO-25's deleted_at and PRO-29's CHECK constraints
//      to the then-shared public.medicines and landed before SEC-17 #4, so the
//      per-tenant copy never got them — while every read in
//      medicineController.ts filters on `WHERE m.deleted_at IS NULL`.
//   3. provision_tenant() is SECURITY DEFINER owned by corehealth_migrator,
//      which had schema-level grants but no table grants, so organisation
//      self-registration failed with "permission denied for table
//      organizations" on any migration-built database.
//
// The common thread is DB-12's "two competing sources of truth": a schema
// change that updates one of corehealth_database.sql / server/migrations/ and
// not the other. A comment asking people to keep them in step is what already
// failed. This asserts the end state instead.
//
// Requires DATABASE_URL to point at a database that has run the full migration
// chain (CI does this — see .github/workflows/ci.yml). Skipped entirely when
// DATABASE_URL is unset, so `npm test` locally without a database is
// unaffected.
import { pool } from '../../config/db';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('pharmacy tenant provisioning (migration-built schema)', () => {
  // A unique slug per run so repeated runs against the same database (and
  // concurrent CI jobs) never collide on the organizations.slug unique index.
  const slug = `ptest${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const schema = `tenant_${slug}`;

  beforeAll(async () => {
    await pool.query('SELECT public.provision_tenant($1, $2, $3, NULL)', [
      slug,
      'Provisioning Test Pharmacy',
      'pharmacy',
    ]);
  });

  afterAll(async () => {
    // DROP SCHEMA needs the role that owns it; the test connects as the app
    // role in CI, so a failure here must not fail the suite — a scratch CI
    // database is discarded anyway.
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await pool.query('DELETE FROM public.organizations WHERE slug = $1', [slug]).catch(() => undefined);
    await pool.end();
  });

  // Bug 3: if the migrator role's table grants are missing, beforeAll above
  // throws and every test here fails — but say so explicitly, because
  // "permission denied for table organizations" is the symptom a reader of a
  // red build needs connected to this cause.
  it('provisions an organisation row (migrator role can write public.organizations)', async () => {
    const { rows } = await pool.query(
      'SELECT schema_name, org_type FROM public.organizations WHERE slug = $1',
      [slug]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].schema_name).toBe(schema);
    expect(rows[0].org_type).toBe('pharmacy');
  });

  // Bug 1: the tables the controllers query must exist in the tenant's schema.
  it.each(['medicines', 'suppliers', 'orders', 'order_items', 'sales', 'sale_items', 'inventory_adjustments'])(
    'creates %s in the tenant schema',
    async table => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table]
      );
      expect(rows).toHaveLength(1);
    }
  );

  // The other half of bug 1: the shared tables must be gone, or a stale
  // code path could silently keep reading every pharmacy's stock.
  it.each(['medicines', 'suppliers'])('no longer has a shared public.%s', async table => {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    expect(rows).toHaveLength(0);
  });

  // Bug 2: the exact predicate every medicineController read uses. Asserting
  // the column exists would pass on a table the real query still cannot use,
  // so run the query shape itself.
  it("supports medicineController's soft-delete read path", async () => {
    await pool.query(
      `INSERT INTO "${schema}".medicines (name, price, cost_price, stock_quantity) VALUES ($1, 10, 5, 7)`,
      ['Paracetamol 500mg']
    );
    const { rows } = await pool.query(
      `SELECT m.id, m.name FROM "${schema}".medicines m
       LEFT JOIN "${schema}".suppliers s ON m.supplier_id = s.id
       WHERE m.deleted_at IS NULL`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Paracetamol 500mg');
  });

  it('soft-deletes rather than hard-deletes (PRO-25)', async () => {
    await pool.query(
      `INSERT INTO "${schema}".medicines (name, price, stock_quantity) VALUES ('Soft Delete Me', 1, 1)`
    );
    await pool.query(
      `UPDATE "${schema}".medicines SET deleted_at = NOW() WHERE name = 'Soft Delete Me'`
    );
    const { rows: visible } = await pool.query(
      `SELECT 1 FROM "${schema}".medicines WHERE name = 'Soft Delete Me' AND deleted_at IS NULL`
    );
    expect(visible).toHaveLength(0);
    const { rows: stillThere } = await pool.query(
      `SELECT 1 FROM "${schema}".medicines WHERE name = 'Soft Delete Me'`
    );
    expect(stillThere).toHaveLength(1);
  });

  // Bug 2, second half: PRO-29's constraints must protect the tenant copy too.
  it.each([
    ['stock_quantity', -1],
    ['price', -1],
    ['cost_price', -1],
  ])('rejects a negative %s (PRO-29)', async (column, value) => {
    await expect(
      pool.query(`UPDATE "${schema}".medicines SET ${column} = $1 WHERE name = 'Paracetamol 500mg'`, [value])
    ).rejects.toThrow();
  });

  // The FKs must point at the tenant's own medicines. If one still referenced
  // public.medicines, dropping the shared table would have failed — or worse,
  // succeeded via CASCADE and silently removed the constraint.
  it('points every tenant foreign key at the tenant-local medicines/suppliers', async () => {
    const { rows } = await pool.query(
      `SELECT c.conname,
              c.conrelid::regclass::text  AS source_table,
              c.confrelid::regclass::text AS target_table
       FROM pg_constraint c
       WHERE c.contype = 'f' AND c.connamespace = $1::regnamespace`,
      [schema]
    );
    const catalogueRefs = rows.filter(
      (r: { target_table: string }) =>
        r.target_table.endsWith('medicines') || r.target_table.endsWith('suppliers')
    );
    // order_items, sale_items, inventory_adjustments → medicines;
    // orders, medicines → suppliers.
    expect(catalogueRefs.length).toBeGreaterThanOrEqual(4);
    for (const ref of catalogueRefs) {
      expect(ref.target_table.startsWith(schema)).toBe(true);
    }
  });
});
