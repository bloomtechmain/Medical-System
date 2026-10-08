import { pool } from '../../config/db';
import { getAll, getOne, create, update, adjustStock, remove } from '../medicineController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));

const query = pool.query as jest.Mock;

describe('medicineController', () => {
  const next = jest.fn();

  describe('getAll', () => {
    it('excludes soft-deleted rows and applies the default page size with no filters', async () => {
      const medicines = [{ id: 1, name: 'Paracetamol' }];
      query.mockResolvedValue({ rows: medicines });

      const res = mockResponse();
      await getAll(mockRequest({ query: {} }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE m.deleted_at IS NULL'), [500, 0]);
      expect(res.json).toHaveBeenCalledWith(medicines);
    });

    it('applies the search filter only once it reaches the minimum length (PRO-02)', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { search: 'panadol' } }), res, next);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), ['%panadol%', 500, 0]);

      query.mockClear();
      await getAll(mockRequest({ query: { search: 'p' } }), res, next);
      expect(query).toHaveBeenCalledWith(expect.not.stringContaining('ILIKE'), [500, 0]);
    });

    it('applies the low_stock filter', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { low_stock: 'true' } }), res, next);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('stock_quantity <= m.reorder_level'),
        [500, 0]
      );
    });

    it('caps an oversized limit at MAX_LIMIT (PRO-03)', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { limit: '99999' } }), res, next);

      expect(query).toHaveBeenCalledWith(expect.any(String), [1000, 0]);
    });
  });

  describe('getOne', () => {
    it('returns 404 when medicine does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Medicine not found' });
    });
  });

  describe('create', () => {
    it('creates a new medicine and returns 201', async () => {
      const body = {
        name: 'Paracetamol', generic_name: 'Acetaminophen', category: 'Pain relief',
        description: '', unit: 'tablet', price: 1.5, cost_price: 1,
        stock_quantity: 100, reorder_level: 10, expiry_date: '2027-01-01', supplier_id: 1,
      };
      const created = { id: 1, ...body };
      query.mockResolvedValue({ rows: [created] });

      const res = mockResponse();
      await create(mockRequest({ body }), res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('update', () => {
    it('never includes stock_quantity in the SET clause, even if the client sends it (PRO-29)', async () => {
      query.mockResolvedValue({ rows: [{ id: 1 }] });

      const res = mockResponse();
      await update(mockRequest({
        params: { id: '1' },
        body: { name: 'X', price: 1, stock_quantity: 99999, is_active: true },
      }), res, next);

      const [sql] = query.mock.calls[0];
      expect(sql).not.toMatch(/stock_quantity\s*=/);
    });

    it('maps a CHECK-constraint violation (negative price) to 400, not a raw 500', async () => {
      query.mockRejectedValue({ code: '23514' });

      const res = mockResponse();
      await update(mockRequest({ params: { id: '1' }, body: { name: 'X', price: -1 } }), res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('adjustStock', () => {
    it('rejects a non-integer or zero delta', async () => {
      const res = mockResponse();
      await adjustStock(mockRequest({ params: { id: '1' }, body: { delta: 0 } }), res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(query).not.toHaveBeenCalled();
    });

    it('applies a relative delta via the database, not an absolute value', async () => {
      query.mockResolvedValue({ rows: [{ id: 1, stock_quantity: 105 }] });

      const res = mockResponse();
      await adjustStock(mockRequest({ params: { id: '1' }, body: { delta: 5 } }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('stock_quantity + $1'), [5, '1']);
      expect(res.json).toHaveBeenCalledWith({ id: 1, stock_quantity: 105 });
    });

    it('maps a CHECK-constraint violation (would go negative) to 409', async () => {
      query.mockRejectedValue({ code: '23514' });

      const res = mockResponse();
      await adjustStock(mockRequest({ params: { id: '1' }, body: { delta: -1000 } }), res, next);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('remove', () => {
    it('soft-deletes (UPDATE deleted_at) rather than issuing a hard DELETE (PRO-25)', async () => {
      query.mockResolvedValue({ rowCount: 1 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '1' } }), res, next);

      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(/UPDATE medicines SET deleted_at/);
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('returns 404 when deleting a missing medicine', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
