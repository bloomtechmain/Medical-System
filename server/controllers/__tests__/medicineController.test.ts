import { pool, resolvePharmacySchema } from '../../config/db';
import { getAll, getOne, create, remove } from '../medicineController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

// SEC-17 #4: medicines moved from one shared public table into each
// pharmacy's own tenant schema — medicineController now resolves the
// caller's schema (resolvePharmacySchema) before touching medicines at all.
// That resolution is its own concern (covered by config/db's own logic);
// here it's mocked to a fixed schema so these tests stay focused on what
// medicineController does once it HAS a schema.
jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  resolvePharmacySchema: jest.fn(),
}));

const query = pool.query as jest.Mock;
const resolveSchema = resolvePharmacySchema as jest.Mock;
const pharmacistUser = { id: 1, role: 'pharmacist' };

describe('medicineController', () => {
  const next = jest.fn();

  beforeEach(() => {
    resolveSchema.mockResolvedValue({ schema: 'tenant_test_pharmacy' });
  });
  afterEach(() => jest.clearAllMocks());

  describe('getAll', () => {
    it('returns all medicines with no filters', async () => {
      const medicines = [{ id: 1, name: 'Paracetamol' }];
      query.mockResolvedValue({ rows: medicines });

      const res = mockResponse();
      await getAll(mockRequest({ query: {}, user: pharmacistUser as any }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
      expect(res.json).toHaveBeenCalledWith(medicines);
    });

    it('applies the search filter', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { search: 'panadol' }, user: pharmacistUser as any }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), ['%panadol%']);
    });

    it('applies the low_stock filter', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getAll(mockRequest({ query: { low_stock: 'true' }, user: pharmacistUser as any }), res, next);

      expect(query).toHaveBeenCalledWith(expect.stringContaining('stock_quantity <= m.reorder_level'), []);
    });

    it('rejects a caller with no pharmacy organization', async () => {
      resolveSchema.mockResolvedValue({ error: 'No pharmacy organization is linked to this account.', status: 400 });

      const res = mockResponse();
      await getAll(mockRequest({ query: {}, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('returns 404 when medicine does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '999' }, user: pharmacistUser as any }), res, next);

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
      await create(mockRequest({ body, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('remove', () => {
    it('returns 404 when deleting a missing medicine', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '999' }, user: pharmacistUser as any }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
