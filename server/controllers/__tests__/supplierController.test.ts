import { pool } from '../../config/db';
import { getAll, getOne, create, update, remove } from '../supplierController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));

const query = pool.query as jest.Mock;

describe('supplierController', () => {
  const next = jest.fn();

  describe('getAll', () => {
    it('returns all suppliers', async () => {
      const suppliers = [{ id: 1, name: 'Acme' }];
      query.mockResolvedValue({ rows: suppliers });

      const res = mockResponse();
      await getAll(mockRequest(), res, next);

      expect(query).toHaveBeenCalledWith('SELECT * FROM suppliers ORDER BY name');
      expect(res.json).toHaveBeenCalledWith(suppliers);
    });

    it('forwards database errors to next()', async () => {
      const error = new Error('DB down');
      query.mockRejectedValue(error);

      await getAll(mockRequest(), mockResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getOne', () => {
    it('returns a supplier by id', async () => {
      const supplier = { id: 1, name: 'Acme' };
      query.mockResolvedValue({ rows: [supplier] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '1' } }), res, next);

      expect(query).toHaveBeenCalledWith('SELECT * FROM suppliers WHERE id = $1', ['1']);
      expect(res.json).toHaveBeenCalledWith(supplier);
    });

    it('returns 404 when supplier does not exist', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await getOne(mockRequest({ params: { id: '999' } }), res, next);

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
      await create(mockRequest({ body }), res, next);

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
      await update(mockRequest({ params: { id: '1' }, body }), res, next);

      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('returns 404 when updating a missing supplier', async () => {
      query.mockResolvedValue({ rows: [] });

      const res = mockResponse();
      await update(mockRequest({ params: { id: '999' }, body: {} }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('remove', () => {
    it('deletes a supplier and returns 204', async () => {
      query.mockResolvedValue({ rowCount: 1 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '1' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 404 when deleting a missing supplier', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const res = mockResponse();
      await remove(mockRequest({ params: { id: '999' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
