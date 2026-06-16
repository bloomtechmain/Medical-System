import { pool } from '../../config/db';
import { getAll, getOne, create, remove } from '../medicineController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));

const query = pool.query as jest.Mock;

describe('medicineController', () => {
  const next = jest.fn();

  describe('getAll', () => {
    it('returns all medicines with no filters', async () => {
      const medicines = [{ id: 1, name: 'Paracetamol' }];
      query.mockResolvedValue({ rows: medicines });

      const res = mockResponse();
      await getAll(mockRequest({ query: {} }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
      expect(res.json).toHaveBeenCalledWith(medicines);
    });

    it('applies the search filter', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { search: 'panadol' } }), res, next);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%panadol%']
      );
    });

    it('applies the low_stock filter', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { low_stock: 'true' } }), res, next);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('stock_quantity <= m.reorder_level'),
        []
      );
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

  describe('remove', () => {
    it('returns 404 when deleting a missing medicine', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
