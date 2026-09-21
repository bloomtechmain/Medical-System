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
      SELECT s.*, u.name AS sold_by_name
      FROM "${schema}".sales s LEFT JOIN users u ON s.sold_by = u.id
      ORDER BY s.sold_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const sale = await pool.query(`SELECT * FROM "${schema}".sales WHERE id = $1`, [req.params.id]);
    if (!sale.rows.length) { res.status(404).json({ message: 'Sale not found' }); return; }

    const items = await pool.query(
      `SELECT si.*, m.name AS medicine_name FROM "${schema}".sale_items si
       JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = $1`,
      [req.params.id]
    );
    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const schema = await requireSchema(req, res);
  if (!schema) return;

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
      `INSERT INTO "${schema}".sales (sold_by, customer_name, total_amount, payment_method)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, customer_name, total, payment_method || 'cash']
    );
    const saleId = sale.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO "${schema}".sale_items (sale_id, medicine_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
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

const getAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const [trend, topMedicines, profit, today, yesterday, thisWeek, lastWeek] = await Promise.all([
      pool.query(`
        SELECT DATE(sold_at) AS date, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS count
        FROM "${schema}".sales
        WHERE sold_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(sold_at)
        ORDER BY date ASC
      `),
      pool.query(`
        SELECT m.id, m.name, SUM(si.quantity) AS quantity, SUM(si.quantity * si.unit_price) AS revenue
        FROM "${schema}".sale_items si
        JOIN "${schema}".sales s ON si.sale_id = s.id
        JOIN medicines m ON si.medicine_id = m.id
        WHERE s.sold_at >= NOW() - INTERVAL '30 days'
        GROUP BY m.id, m.name
        ORDER BY revenue DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
               COALESCE(SUM(si.quantity * m.cost_price), 0) AS cost
        FROM "${schema}".sale_items si
        JOIN "${schema}".sales s ON si.sale_id = s.id
        JOIN medicines m ON si.medicine_id = m.id
        WHERE s.sold_at >= NOW() - INTERVAL '30 days'
      `),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at::date = CURRENT_DATE`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at::date = CURRENT_DATE - INTERVAL '1 day'`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales WHERE sold_at >= date_trunc('week', CURRENT_DATE)`),
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS total FROM "${schema}".sales
        WHERE sold_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
          AND sold_at < date_trunc('week', CURRENT_DATE)
      `),
    ]);

    const revenue30 = parseFloat(profit.rows[0].revenue);
    const cost30 = parseFloat(profit.rows[0].cost);

    res.json({
      trend: trend.rows.map((r) => ({ date: r.date, revenue: parseFloat(r.revenue), count: parseInt(r.count) })),
      topMedicines: topMedicines.rows.map((r) => ({
        id: r.id, name: r.name, quantity: parseInt(r.quantity), revenue: parseFloat(r.revenue),
      })),
      profit: {
        revenue: revenue30,
        cost: cost30,
        profit: revenue30 - cost30,
        marginPct: revenue30 > 0 ? ((revenue30 - cost30) / revenue30) * 100 : 0,
      },
      comparison: {
        today: parseFloat(today.rows[0].total),
        yesterday: parseFloat(yesterday.rows[0].total),
        thisWeek: parseFloat(thisWeek.rows[0].total),
        lastWeek: parseFloat(lastWeek.rows[0].total),
      },
    });
  } catch (err) { next(err); }
};

export { getAll, getOne, create, getAnalytics };
