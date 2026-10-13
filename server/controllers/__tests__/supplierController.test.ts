import { pool, resolvePharmacySchema } from '../../config/db';
import { getAll, getOne, create, update, remove } from '../supplierController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

// SEC-17 #4: see medicineController.test.ts — suppliers moved from one
// shared public table into each pharmacy's own tenant schema.
jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  resolvePharmacySchema: jest.fn(),
}));

const query = pool.query as jest.Mock;
const resolveSchema = resolvePharmacySchema as jest.Mock;
const SCHEMA = 'tenant_test_pharmacy';
const pharmacist = { id: 1, role: 'pharmacist' };
const asPharmacist = (overrides: Record<string, unknown> = {}) =>
  mockRequest({ user: pharmacist as any, ...overrides });

describe('supplierController', () => {
  const next = jest.fn();

  beforeEach(() => { resolveSchema.mockResolvedValue({ schema: SCHEMA }); });
  afterEach(() => jest.clearAllMocks());

  describe('getAll', () => {
    it('returns all suppliers, scoped to the caller\'s own pharmacy schema', async () => {
      const suppliers = [{ id: 1, name: 'Acme' }];
      query.mockResolvedValue({ rows: suppliers });

      const res = mockResponse();
      await getAll(asPharmacist(), res, next);

      expect(query).toHaveBeenCalledWith(
        `SELECT * FROM "${SCHEMA}".suppliers ORDER BY name LIMIT $1 OFFSET $2`,
        [500, 0]
      );
      expect(res.json).toHaveBeenCalledWith(suppliers);
    });

    it('rejects a caller with no pharmacy organization, before any query runs', async () => {
      resolveSchema.mockResolvedValue({ error: 'No pharmacy organization is linked to this account.', status: 400 });

      const res = mockResponse();
      await getAll(asPharmacist(), res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(query).not.toHaveBeenCalled();
    });

    it('forwards database errors to next()', async () => {
      const error = new Error('DB down');
      query.mockRejectedValue(error);

      await getAll(asPharmacist(), mockResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getOne', () => {
    it('returns a supplier by id', async () => {
      const supplier = { id: 1, name: 'Acme' };
      query.mockResolvedValue({ rows: [supplier] });

      const res = mockResponse();
      await getOne(asPharmacist({ params: { id: '1' } }), res, next);

      expect(query).toHaveBeenCalledWith(`SELECT * FROM "${SCHEMA}".suppliers WHERE id = $1`, ['1']);
      expect(res.json).toHaveBeenCalledWith(supplier);
    });

    it('returns 404 when supplier does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getOne(asPharmacist({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Supplier not found' });
    });
  });

  describe('create', () => {
    it('creates a new supplier and returns 201', async () => {
      const body = { name: 'Acme', contact: 'John', phone: '123', email: 'a@a.com', address: 'Addr' };
      const created = { id: 1, ...body };
      query.mockResolvedValue({ rows: [created] });

      const res = mockResponse();
      await create(asPharmacist({ body }), res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('update', () => {
    it('updates an existing supplier', async () => {
      const body = { name: 'Acme Updated', contact: 'John', phone: '123', email: 'a@a.com', address: 'Addr' };
      const updated = { id: 1, ...body };
      query.mockResolvedValue({ rows: [updated] });

      const res = mockResponse();
      await update(asPharmacist({ params: { id: '1' }, body }), res, next);

      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('returns 404 when updating a missing supplier', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await update(asPharmacist({ params: { id: '999' }, body: {} }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('remove', () => {
    it('deletes a supplier and returns 204', async () => {
      query.mockResolvedValue({ rowCount: 1 });

      const res = mockResponse();
      await remove(asPharmacist({ params: { id: '1' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 404 when deleting a missing supplier', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(asPharmacist({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
