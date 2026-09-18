import { Request, Response, NextFunction } from 'express';
import { pool, getTenantSchema } from '../config/db';

const requireSchema = async (req: Request, res: Response): Promise<string | null> => {
  const schema = await getTenantSchema(req.user.id);
  if (!schema) {
    res.status(400).json({ message: 'No pharmacy organization is linked to this account.' });
    return null;
  }
  return schema;
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { rows } = await pool.query(`
      SELECT o.*, s.name AS supplier_name, u.name AS ordered_by_name
      FROM "${schema}".orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN users u ON o.ordered_by = u.id
      ORDER BY o.ordered_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const order = await pool.query(
      `SELECT o.*, s.name AS supplier_name FROM "${schema}".orders o
       LEFT JOIN suppliers s ON o.supplier_id = s.id WHERE o.id = $1`,
      [req.params.id]
    );
    if (!order.rows.length) { res.status(404).json({ message: 'Order not found' }); return; }

    const items = await pool.query(
      `SELECT oi.*, m.name AS medicine_name FROM "${schema}".order_items oi
       JOIN medicines m ON oi.medicine_id = m.id WHERE oi.order_id = $1`,
      [req.params.id]
    );
    res.json({ ...order.rows[0], items: items.rows });
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const schema = await requireSchema(req, res);
  if (!schema) return;

  const client = await pool.connect();
  try {
    const { supplier_id, notes, items } = req.body as {
      supplier_id: number;
      notes?: string;
      items: Array<{ medicine_id: number; quantity: number; unit_cost: number }>;
    };
    await client.query('BEGIN');

    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
    const order = await client.query(
      `INSERT INTO "${schema}".orders (supplier_id, ordered_by, total_amount, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [supplier_id, req.user.id, total, notes]
    );
    const orderId = order.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO "${schema}".order_items (order_id, medicine_id, quantity, unit_cost) VALUES ($1,$2,$3,$4)`,
        [orderId, item.medicine_id, item.quantity, item.unit_cost]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(order.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const receive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const schema = await requireSchema(req, res);
  if (!schema) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: items } = await client.query(
      `SELECT * FROM "${schema}".order_items WHERE order_id = $1`, [req.params.id]
    );
    for (const item of items) {
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.medicine_id]
      );
    }
    const { rows } = await client.query(
      `UPDATE "${schema}".orders SET status='received', received_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export { getAll, getOne, create, receive };
