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
const pharmacistUser = { id: 1, role: 'pharmacist' };

describe('supplierController', () => {
  const next = jest.fn();

  beforeEach(() => {
    resolveSchema.mockResolvedValue({ schema: 'tenant_test_pharmacy' });
  });
  afterEach(() => jest.clearAllMocks());

  describe('getAll', () => {
    it('returns all suppliers', async () => {
      const suppliers = [{ id: 1, name: 'Acme' }];
      query.mockResolvedValue({ rows: suppliers });

      const res = mockResponse();
      await getAll(mockRequest({ user: pharmacistUser as any }), res, next);

      expect(query).toHaveBeenCalledWith('SELECT * FROM "tenant_test_pharmacy".suppliers ORDER BY name');
      expect(res.json).toHaveBeenCalledWith(suppliers);
    });

    it('forwards database errors to next()', async () => {
      const error = new Error('DB down');
      query.mockRejectedValue(error);

      await getAll(mockRequest({ user: pharmacistUser as any }), mockResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getOne', () => {
    it('returns a supplier by id', async () => {
      const supplier = { id: 1, name: 'Acme' };
      query.mockResolvedValue({ rows: [supplier] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '1' }, user: pharmacistUser as any }), res, next);

      expect(query).toHaveBeenCalledWith('SELECT * FROM "tenant_test_pharmacy".suppliers WHERE id = $1', ['1']);
      expect(res.json).toHaveBeenCalledWith(supplier);
    });

    it('returns 404 when supplier does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '999' }, user: pharmacistUser as any }), res, next);

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
      await create(mockRequest({ body, user: pharmacistUser as any }), res, next);

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
      await update(mockRequest({ params: { id: '1' }, body, user: pharmacistUser as any }), res, next);

      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('returns 404 when updating a missing supplier', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await update(mockRequest({ params: { id: '999' }, body: {}, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('remove', () => {
    it('deletes a supplier and returns 204', async () => {
      query.mockResolvedValue({ rowCount: 1 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '1' }, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 404 when deleting a missing supplier', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '999' }, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
