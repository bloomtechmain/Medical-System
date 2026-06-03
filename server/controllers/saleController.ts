import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const getAll = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name AS sold_by_name
      FROM sales s LEFT JOIN users u ON s.sold_by = u.id
      ORDER BY s.sold_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sale = await pool.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!sale.rows.length) { res.status(404).json({ message: 'Sale not found' }); return; }

    const items = await pool.query(
      `SELECT si.*, m.name AS medicine_name FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = $1`,
      [req.params.id]
    );
    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { customer_name, payment_method, items } = req.body as {
      customer_name?: string;
      payment_method?: string;
      items: Array<{ medicine_id: number; quantity: number; unit_price: number }>;
    };
    await client.query('BEGIN');

    // Validate stock
    for (const item of items) {
      const { rows } = await client.query(
        'SELECT stock_quantity FROM medicines WHERE id = $1 FOR UPDATE', [item.medicine_id]
      );
      if (!rows.length || rows[0].stock_quantity < item.quantity) {
        throw Object.assign(new Error(`Insufficient stock for medicine id ${item.medicine_id}`), { status: 400 });
      }
    }

    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const sale = await client.query(
      `INSERT INTO sales (sold_by, customer_name, total_amount, payment_method)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, customer_name, total, payment_method || 'cash']
    );
    const saleId = sale.rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO sale_items (sale_id, medicine_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [saleId, item.medicine_id, item.quantity, item.unit_price]
      );
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.medicine_id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(sale.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export { getAll, getOne, create };
